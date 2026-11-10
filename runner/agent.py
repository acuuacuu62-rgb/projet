"""ZetaInstall fixed-action runner. stdin JSON only; never executes user scripts."""
import os,sys,json,subprocess,platform,shutil,socket,ipaddress,re,fcntl,pathlib,hashlib,urllib.request,tarfile,tempfile,secrets,time
from urllib.parse import urlparse

def emit(kind,**kw):print(json.dumps(dict(kind=kind,**kw)),flush=True)
def step(name,progress):emit('step',step=name,progress=progress)
def run(args,data=None,timeout=120,check=True):
    p=subprocess.run(args,input=data,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive','LC_ALL':'C.UTF-8'})
    if check and p.returncode:raise RuntimeError('Command failed: '+pathlib.Path(args[0]).name+'. Inspect the service locally; raw command output is withheld to protect secrets.')
    return p.stdout.strip(),p.returncode

def osinfo():
    values={}
    for line in pathlib.Path('/etc/os-release').read_text().splitlines():
        if '=' in line:
            k,v=line.split('=',1);values[k]=v.strip('"')
    return values

def probe():
    info=osinfo();usage=shutil.disk_usage('/');memory=0
    for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemTotal:'):memory=int(line.split()[1])*1024
    checks=[]
    for service in ['nginx','php8.3-fpm','mariadb','redis-server','docker','wings','pteroq']:
        out,code=run(['systemctl','is-active',service],check=False)
        checks.append({'name':service,'status':'pass' if code==0 else 'unknown','explanation':'Service is active' if code==0 else 'Service is inactive or not installed','severity':'info'})
    ports,_=run(['ss','-lntuH'],check=False)
    checks.append({'name':'listening_ports','status':'pass','severity':'info','explanation':ports[:12000]})
    for tool in ['ufw','nft','iptables']:
        if shutil.which(tool):
            args={'ufw':['ufw','status'],'nft':['nft','list','ruleset'],'iptables':['iptables','-S']}[tool]
            output,code=run(args,check=False)
            checks.append({'name':tool,'status':'pass' if code==0 else 'unknown','severity':'info','explanation':output[:16000] if code==0 else 'Could not inspect host firewall'})
    checks.append({'name':'provider_firewall','status':'unknown','severity':'warning','explanation':'Provider rules cannot be inferred from SSH. Inspect the external firewall in the provider console.'})
    return {'os':info.get('PRETTY_NAME'),'os_id':info.get('ID'),'os_version':info.get('VERSION_ID'),'architecture':platform.machine(),'cpus':os.cpu_count(),'ram_bytes':memory,'disk_free':usage.free,'disk_total':usage.total,'root':os.geteuid()==0,'package_manager':'apt' if shutil.which('apt-get') else 'unknown','checks':checks,'verified_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}

def domain(v):
    if not isinstance(v,str) or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}',v) or len(v)>253:raise RuntimeError('Invalid domain')
    return v

def public_resolve(host):
    addresses={i[4][0] for i in socket.getaddrinfo(host,None,type=socket.SOCK_STREAM)}
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):raise RuntimeError('Destination resolves to a private, reserved or local network')
    return sorted(addresses)[0]

def preflight(c):
    info=osinfo()
    if info.get('ID')!='ubuntu' or info.get('VERSION_ID')!='24.04':raise RuntimeError('Automatic changes currently require the Ubuntu 24.04 profile. Other OS profiles require staging validation.')
    if os.geteuid()!=0:raise RuntimeError('Root or passwordless sudo is required')
    if not pathlib.Path('/run/systemd/system').exists():raise RuntimeError('A systemd Linux VPS is required')
    facts=probe()
    if facts['ram_bytes']<2*1024**3 or facts['disk_free']<10*1024**3:raise RuntimeError('At least 2 GiB RAM and 10 GiB free disk are required by this installation profile')
    host=domain(c['domain']);public_resolve(host)
    # Resolve all records and ensure they are addresses actually assigned to this VPS (public NAT requires manual profile).
    records={i[4][0] for i in socket.getaddrinfo(host,None,type=socket.SOCK_STREAM)}
    addresses=json.loads(run(['ip','-j','address','show'])[0]);local={a['local'] for interface in addresses for a in interface.get('addr_info',[])}
    if not records.issubset(local):raise RuntimeError('All A/AAAA records must point to an address assigned to this VPS. NAT topologies require a verified networking profile.')
    return host

def write(path,text,mode=0o600):
    p=pathlib.Path(path)
    if p.is_symlink():raise RuntimeError('Refusing symbolic-link configuration target')
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_name(p.name+'.zeta-'+secrets.token_hex(6))
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,mode)
    with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
    os.replace(tmp,p)

def download(url,target,digest):
    h=hashlib.sha256()
    with urllib.request.urlopen(url,timeout=60) as r,open(target,'wb') as f:
        while True:
            b=r.read(1024*1024)
            if not b:break
            h.update(b);f.write(b)
    if h.hexdigest()!=digest:
        os.unlink(target);raise RuntimeError('Release artifact checksum mismatch. Installation stopped.')

def apt(packages):run(['apt-get','install','-y','--no-install-recommends',*packages],timeout=1200)

def certificate(host,email):
    if pathlib.Path('/etc/letsencrypt/live/'+host).exists():raise RuntimeError('An existing certificate was found. Review it before changing TLS.')
    occupied=run(['ss','-ltnH'])[0]
    if re.search(r':80\s',occupied):raise RuntimeError('Port 80 is occupied. Resolve the web server conflict before issuing a certificate.')
    run(['certbot','certonly','--standalone','--non-interactive','--agree-tos','--email',email,'-d',host],timeout=180)

def install_panel(c):
    host=preflight(c);root=pathlib.Path('/var/www/pterodactyl')
    if root.exists() or pathlib.Path('/etc/nginx/sites-enabled/pterodactyl.conf').exists():raise RuntimeError('Existing Panel detected. Fresh install refused; preserve APP_KEY and use a reviewed recovery procedure.')
    for service in ['nginx','mariadb','redis-server']:
        if run(['systemctl','is-active',service],check=False)[1]==0:raise RuntimeError('Existing '+service+' service detected. A dedicated fresh VPS is required for this profile.')
    email=c.get('email','')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise RuntimeError('Valid administrator email required')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{3,32}',c.get('admin_name','')) or len(c.get('admin_password',''))<12:raise RuntimeError('Invalid administrator credentials')
    step('Preparing signed Ubuntu package repositories',12);run(['apt-get','update'],timeout=300)
    apt(['ca-certificates','curl','tar','unzip','git','php8.3-cli','php8.3-fpm','php8.3-gd','php8.3-mysql','php8.3-mbstring','php8.3-bcmath','php8.3-xml','php8.3-curl','php8.3-zip','composer','mariadb-server','redis-server','nginx','certbot'])
    php=run(['php','-r','echo PHP_VERSION;'])[0]
    if tuple(map(int,php.split('-')[0].split('.')[:3]))<(8,3,36):raise RuntimeError('PHP 8.3.36 or a verified newer security patch is required. No unsafe downgrade/override is supported.')
    if not run(['composer','--version'])[0].startswith('Composer version 2.'):raise RuntimeError('Composer 2 is required')
    # Stop the newly installed webserver for standalone ACME; no pre-existing service was allowed above.
    run(['systemctl','stop','nginx']);step('Verifying DNS and issuing TLS certificate',25);certificate(host,email)
    step('Downloading and verifying Panel 1.15.2',36);root.mkdir(parents=True,mode=0o755)
    with tempfile.TemporaryDirectory() as td:
        archive=td+'/panel.tar.gz';download('https://github.com/pterodactyl/panel/releases/download/v1.15.2/panel.tar.gz',archive,'572aacdf896e2dbce3df4c42f055e77a1e419598b224b7d6ebf3bf41462af8cf')
        with tarfile.open(archive) as t:t.extractall(root,filter='data')
    dbpass=secrets.token_hex(32);appkey='base64:'+__import__('base64').b64encode(secrets.token_bytes(32)).decode()
    env={'APP_ENV':'production','APP_DEBUG':'false','APP_KEY':appkey,'APP_URL':'https://'+host,'APP_TIMEZONE':'UTC','DB_CONNECTION':'mysql','DB_HOST':'127.0.0.1','DB_PORT':'3306','DB_DATABASE':'zeta_panel','DB_USERNAME':'zeta_panel','DB_PASSWORD':dbpass,'CACHE_DRIVER':'redis','SESSION_DRIVER':'redis','QUEUE_CONNECTION':'redis','REDIS_HOST':'127.0.0.1','REDIS_PORT':'6379','MAIL_MAILER':'log'}
    write(root/'.env','\n'.join(k+'='+json.dumps(v) for k,v in env.items())+'\n')
    run(['systemctl','enable','--now','mariadb','redis-server','php8.3-fpm'])
    existing=run(['mariadb','--batch','--skip-column-names'],"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='zeta_panel';")[0]
    if existing:raise RuntimeError('Panel database already exists. No overwrite is allowed.')
    step('Creating isolated database credentials',49)
    run(['mariadb'],"CREATE DATABASE zeta_panel; CREATE USER 'zeta_panel'@'127.0.0.1' IDENTIFIED BY '"+dbpass+"'; GRANT ALL PRIVILEGES ON zeta_panel.* TO 'zeta_panel'@'127.0.0.1';")
    step('Installing locked Composer dependencies and migrating database',60)
    run(['composer','--working-dir='+str(root),'install','--no-dev','--optimize-autoloader','--no-interaction'],timeout=1200)
    run(['php',str(root/'artisan'),'migrate','--seed','--force'],timeout=600)
    phpcode="chdir('/var/www/pterodactyl');require 'vendor/autoload.php';$app=require 'bootstrap/app.php';$kernel=$app->make(Illuminate\\Contracts\\Console\\Kernel::class);$kernel->bootstrap();$x=json_decode(stream_get_contents(STDIN),true);$code=$kernel->call('p:user:make',['--email'=>$x['email'],'--username'=>$x['name'],'--name-first'=>'Zeta','--name-last'=>'Administrator','--password'=>$x['password'],'--admin'=>'1','--no-interaction'=>true]);exit($code);"
    run(['php','-r',phpcode],json.dumps({'name':c['admin_name'],'email':email,'password':c['admin_password']}))
    run(['chown','-R','www-data:www-data',str(root)]);run(['chmod','-R','750',str(root/'storage'),str(root/'bootstrap/cache')]);os.chmod(root/'.env',0o640)
    step('Configuring Nginx, scheduler and Panel queue',76)
    nginx='''server { listen 80; server_name DOMAIN; return 301 https://$host$request_uri; }
server { listen 443 ssl; server_name DOMAIN;
root /var/www/pterodactyl/public; index index.php;
ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3; client_max_body_size 100m;
location / { try_files $uri $uri/ /index.php?$query_string; }
location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/run/php/php8.3-fpm.sock; }
location ~ /\\.ht { deny all; }
}'''.replace('DOMAIN',host)
    write('/etc/nginx/sites-available/pterodactyl.conf',nginx,0o644);os.symlink('/etc/nginx/sites-available/pterodactyl.conf','/etc/nginx/sites-enabled/pterodactyl.conf')
    write('/etc/cron.d/pterodactyl','* * * * * www-data php /var/www/pterodactyl/artisan schedule:run > /dev/null 2>&1\n',0o644)
    write('/etc/systemd/system/pteroq.service','[Unit]\nDescription=Pterodactyl Queue\nAfter=redis-server.service mariadb.service\n[Service]\nUser=www-data\nGroup=www-data\nRestart=always\nExecStart=/usr/bin/php /var/www/pterodactyl/artisan queue:work --sleep=3 --tries=3\n[Install]\nWantedBy=multi-user.target\n',0o644)
    run(['nginx','-t']);run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','nginx','pteroq','cron']);step('Verifying Panel services and HTTPS',93)
    for svc in ['nginx','php8.3-fpm','mariadb','redis-server','pteroq']:run(['systemctl','is-active',svc])
    run(['redis-cli','PING']);run(['curl','--noproxy','*','--fail','--silent','--show-error','--max-time','20','https://'+host+'/auth/login'])
    return {'component':'Panel','version':'1.15.2','url':'https://'+host,'services_verified':True,'app_key_backup_required':True,'note':'Back up /var/www/pterodactyl/.env securely. SMTP for the Panel must be configured separately.'}

def install_wings(c,existing=False):
    host=preflight(c);cfg=c.get('wings_config',{})
    panel=urlparse(c.get('panel_url',''))
    if panel.scheme!='https' or panel.username or panel.password or panel.path not in ['','/'] or panel.query or panel.fragment:raise RuntimeError('A valid HTTPS Panel origin is required')
    public_resolve(panel.hostname)
    target=pathlib.Path('/etc/pterodactyl/config.yml')
    if target.exists():raise RuntimeError('Existing Wings config detected. Overwrite is disabled; back up and review existing configuration first.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,256}',cfg.get('token_id','')) or not re.fullmatch(r'[A-Za-z0-9_.-]{16,256}',cfg.get('token','')):raise RuntimeError('Invalid daemon authentication configuration')
    if not re.fullmatch(r'[a-fA-F0-9-]{36}',cfg.get('uuid','')):raise RuntimeError('Invalid Wings UUID')
    if cfg.get('remote','').rstrip('/')!=c['panel_url'].rstrip('/'):raise RuntimeError('Configuration Panel URL does not match the selected Panel')
    api=cfg.get('api',{});port=api.get('port',8080);sftp=cfg.get('system',{}).get('sftp',{}).get('bind_port',2022)
    if not isinstance(port,int) or not isinstance(sftp,int) or not 1024<=port<=65535 or not 1024<=sftp<=65535 or port==sftp:raise RuntimeError('Use distinct daemon and SFTP ports between 1024 and 65535')
    occupied=run(['ss','-ltnH'])[0]
    if re.search(r':(?:'+str(port)+'|'+str(sftp)+r')\s',occupied):raise RuntimeError('Daemon or SFTP port conflict detected')
    if c.get('proxy') and (pathlib.Path('/etc/nginx/sites-enabled/wings.conf').exists() or run(['systemctl','is-active','nginx'],check=False)[1]==0):raise RuntimeError('Existing Nginx detected. Reverse proxy requires a reviewed merge rather than overwriting active TLS.')
    if platform.machine() not in ['x86_64','aarch64']:raise RuntimeError('No verified Wings artifact for this architecture')
    if shutil.which('docker') is None:raise RuntimeError('Install Docker Engine using its official signed repository before installing Wings. The runner will not execute an unreviewed convenience script.')
    run(['docker','info']);step('Verifying Docker and signed release artifact',28)
    apt(['ca-certificates','curl','certbot']+(['nginx'] if c.get('proxy') else []))
    if c.get('proxy'):run(['systemctl','stop','nginx'])
    email=c.get('email')
    if not email:raise RuntimeError('A certificate contact email is required in the Wings configuration')
    certificate(host,email);arch='amd64' if platform.machine()=='x86_64' else 'arm64';digest={'amd64':'7e763389bb5d386a7d32ccdd46cffcf1ab9ed697e5c2aca7fe44183b527cd4c0','arm64':'516cc0b86fec092feb9893bacab2e1bf478b5477a5459ad9d722676c7549faa5'}[arch]
    with tempfile.TemporaryDirectory() as td:
        file=td+'/wings';download('https://github.com/pterodactyl/wings/releases/download/v1.13.4/wings_linux_'+arch,file,digest);shutil.copyfile(file,'/usr/local/bin/wings');os.chmod('/usr/local/bin/wings',0o755)
    step('Writing restricted Wings configuration',55)
    safe={'debug':False,'uuid':cfg['uuid'],'token_id':cfg['token_id'],'token':cfg['token'],'api':{'host':'127.0.0.1' if c.get('proxy') else '0.0.0.0','port':port,'ssl':{'enabled':True,'cert':'/etc/letsencrypt/live/'+host+'/fullchain.pem','key':'/etc/letsencrypt/live/'+host+'/privkey.pem'}},'system':{'data':'/var/lib/pterodactyl/volumes','sftp':{'bind_address':'0.0.0.0','bind_port':sftp}},'remote':c['panel_url']}
    target.parent.mkdir(mode=0o700,parents=True,exist_ok=True);write(target,json.dumps(safe));os.chmod(target,0o600)
    write('/etc/systemd/system/wings.service','[Unit]\nDescription=Pterodactyl Wings\nAfter=docker.service\nRequires=docker.service\n[Service]\nUser=root\nWorkingDirectory=/etc/pterodactyl\nExecStart=/usr/local/bin/wings\nRestart=on-failure\nRestartSec=5\nLimitNOFILE=4096\n[Install]\nWantedBy=multi-user.target\n',0o644)
    if c.get('proxy'):
        template='''server { listen 443 ssl; server_name DOMAIN;
ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
location / { proxy_pass https://127.0.0.1:PORT; proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
proxy_ssl_server_name on; proxy_ssl_name DOMAIN; proxy_ssl_verify on;
proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
proxy_read_timeout 300s; client_max_body_size 100m; } }
server { listen 80; server_name DOMAIN; location /.well-known/acme-challenge/ { root /var/www/html; } }'''.replace('DOMAIN',host).replace('PORT',str(port))
        write('/etc/nginx/sites-available/wings.conf',template,0o644);os.symlink('/etc/nginx/sites-available/wings.conf','/etc/nginx/sites-enabled/wings.conf');run(['nginx','-t']);run(['systemctl','enable','--now','nginx'])
    step('Starting Wings and verifying systemd',83);run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','wings']);time.sleep(3);run(['systemctl','is-active','wings'])
    # Secret goes to curl through stdin config, never argv.
    step('Verifying authenticated Wings API',94)
    url='https://'+host+('' if c.get('proxy') else ':'+str(port))+'/api/system'
    curlconf='header = '+json.dumps('Authorization: Bearer '+cfg['token'])+'\n'
    run(['curl','--noproxy','*','--fail','--silent','--max-time','20','--config','-',url],curlconf)
    return {'component':'Wings','version':'1.13.4','services_verified':True,'api_verified':True,'sftp_port':sftp,'proxy':bool(c.get('proxy')),'panel_to_wings':'not independently verified','verification_incomplete':True,'note':'Confirm Panel-to-Wings connectivity from the Panel host. Public HTTP proxy does not carry SFTP or game allocations.'}

def main():
    payload=json.loads(sys.stdin.read(262145));action=payload.get('action');c=payload.get('config',{})
    if action not in ['probe','diagnostics','firewall_check','ssl_check','install_panel','install_wings','configure_wings','upcloud_setup','key_install','certificate_issue','certificate_renew','repair_service']:raise RuntimeError('Action is not allowlisted')
    if action not in ['probe','diagnostics','firewall_check','ssl_check'] and c.get('consent') is not True:raise RuntimeError('Explicit mutation consent is required')
    if os.geteuid()!=0:raise RuntimeError('The fixed runner requires root or passwordless sudo')
    pathlib.Path('/run/lock').mkdir(exist_ok=True);lock=open('/run/lock/zetainstall.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if action in ['probe','diagnostics','firewall_check','ssl_check']:
        step('Reading OS, resources, services and host firewall',35);result=probe()
    elif action in ['certificate_issue','certificate_renew']:
        host=preflight(c);step('Checking existing TLS and ACME prerequisites',25)
        if shutil.which('certbot') is None:raise RuntimeError('Install Certbot from a trusted repository before certificate operations')
        if action=='certificate_issue':certificate(host,c.get('email',''))
        else:
            cert=pathlib.Path('/etc/letsencrypt/live/'+host+'/fullchain.pem')
            if not cert.exists():raise RuntimeError('No managed certificate exists for this domain')
            before=cert.read_bytes();run(['certbot','renew','--cert-name',host,'--non-interactive','--no-random-sleep-on-renew'],timeout=300)
            result={'domain':host,'renewed':before!=cert.read_bytes(),'note':'Certbot renew only changes a certificate when renewal is due. Verify the live endpoint after any deployment hook.'}
        if action=='certificate_issue':result={'domain':host,'issued':True,'note':'Certificate issued. Configure the service to load it and verify the public endpoint before claiming live TLS is ready.'}
    elif action=='repair_service':
        service=c.get('service');operation=c.get('operation')
        if service not in ['nginx','php8.3-fpm','mariadb','redis-server','wings','pteroq'] or operation not in ['start','restart']:raise RuntimeError('Repair action is not allowlisted')
        if service=='nginx':run(['nginx','-t'])
        step('Applying approved service action',40);run(['systemctl',operation,service]);time.sleep(2);run(['systemctl','is-active',service]);result={'service':service,'operation':operation,'active':True,'note':'Service state verified. Application connectivity still needs its own diagnostic check.'}
    elif action=='install_panel':result=install_panel(c)
    elif action in ['install_wings','configure_wings','upcloud_setup']:result=install_wings(c,action=='configure_wings')
    else:
        key=c.get('public_key','')
        if not re.fullmatch(r'(ssh-ed25519|ssh-rsa) [A-Za-z0-9+/=]+(?: [^\r\n]*)?',key):raise RuntimeError('Invalid public key')
        home=pathlib.Path('/root/.ssh');home.mkdir(mode=0o700,exist_ok=True);file=home/'authorized_keys'
        previous=file.read_text() if file.exists() else ''
        if key.split()[1] not in previous:write(file,previous.rstrip()+'\n'+key+'\n')
        result={'installed':True,'note':'Public key added for root. A second independent SSH connection must be tested before relying on it.'}
    emit('result',data=result)
if __name__=='__main__':
    try:main()
    except BlockingIOError:emit('error',message='Another ZetaInstall operation is still running on this VPS. Reconcile before retrying.');sys.exit(1)
    except Exception as e:
        message=str(e) if isinstance(e,RuntimeError) else 'Remote operation failed. Inspect the target locally; raw output is withheld to protect credentials.'
        emit('error',message=message);sys.exit(1)
