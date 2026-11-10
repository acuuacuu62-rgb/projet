"""No remote hosts or package changes: exercise the real runner with mocked I/O."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('agent', pathlib.Path(__file__).parents[2] / 'runner/agent.py')
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class ProfileTests(unittest.TestCase):
    def test_profiles_match_real_os_and_preserve_legacy_default(self):
        for version in ['22.04', '24.04']:
            self.assertEqual(agent.select_profile({'ID': 'ubuntu', 'VERSION_ID': version}, 'ubuntu-'+version), 'ubuntu-'+version)
        self.assertEqual(agent.select_profile({'ID': 'ubuntu', 'VERSION_ID': '24.04'}), 'ubuntu-24.04')
        for info, requested in [
            ({'ID': 'ubuntu', 'VERSION_ID': '22.04'}, 'ubuntu-24.04'),
            ({'ID': 'ubuntu', 'VERSION_ID': '24.04'}, 'ubuntu-22.04'),
            ({'ID': 'debian', 'VERSION_ID': '22.04'}, 'ubuntu-22.04'),
            ({'ID': 'ubuntu', 'VERSION_ID': '26.04'}, 'ubuntu-24.04'),
            ({'ID': 'ubuntu', 'VERSION_ID': '22.04'}, 'ubuntu-22.04;id'),
        ]:
            with self.subTest(info=info, requested=requested), self.assertRaises(RuntimeError):
                agent.select_profile(info, requested)

    def test_mismatch_stops_before_probing_or_package_changes(self):
        with patch.object(agent, 'osinfo', return_value={'ID': 'ubuntu', 'VERSION_ID': '24.04'}), patch.object(agent, 'probe') as probe, patch.object(agent, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'does not match'):
                agent.preflight({'os_profile': 'ubuntu-22.04'})
            probe.assert_not_called()
            run.assert_not_called()

    def dependency_run(self, args, *a, **kw):
        if args[:2] == [agent.PHP, '-r']: return ('8.3.36-1+ubuntu22.04', 0)
        if args[-1] == '--version': return ('Composer version 2.8.0', 0)
        return ('', 0)

    def test_jammy_adds_only_fixed_ppa_before_php_install(self):
        with patch.object(agent, 'run', side_effect=self.dependency_run) as run, patch.object(agent, 'step'):
            agent.panel_dependencies('ubuntu-22.04')
        commands = [call.args[0] for call in run.call_args_list]
        add = ['add-apt-repository', '--yes', '--no-update', 'ppa:ondrej/php']
        self.assertIn(add, commands)
        install = next(c for c in commands if 'php8.3-cli' in c)
        self.assertLess(commands.index(add), commands.index(install))
        self.assertEqual(commands[commands.index(add)+1], ['apt-get', 'update'])
        self.assertIn('cron', install)
        self.assertIn([agent.PHP, '/usr/bin/composer', '--version'], commands)

    def test_noble_does_not_add_jammy_ppa(self):
        with patch.object(agent, 'run', side_effect=self.dependency_run) as run, patch.object(agent, 'step'):
            agent.panel_dependencies('ubuntu-24.04')
        self.assertFalse(any('add-apt-repository' in c.args[0] for c in run.call_args_list))

    def test_unpatched_or_incompatible_php_stops(self):
        for version in ['8.1.2', '8.3.35', '8.2.35', '8.4.1', 'garbage']:
            with self.subTest(version=version), patch.object(agent, 'run', return_value=(version, 0)), patch.object(agent, 'step'):
                with self.assertRaisesRegex(RuntimeError, 'PHP 8.3.36'):
                    agent.panel_dependencies('ubuntu-22.04')

    def test_missing_profile_cannot_change_packages(self):
        with patch.object(agent, 'run') as run, self.assertRaises(RuntimeError):
            agent.panel_dependencies('arbitrary-profile')
        run.assert_not_called()

    def test_fresh_panel_uses_php83_for_composer_artisan_cron_and_queue(self):
        path = MagicMock()
        path.exists.return_value = False
        path.__truediv__.return_value = path
        def command(args, *a, **kw):
            if args[:2] == ['systemctl', 'is-active']: return ('inactive', 3)
            return ('', 0)
        config = {'os_profile': 'ubuntu-22.04', 'domain': 'panel.example.com', 'email': 'admin@example.com', 'admin_name': 'admin', 'admin_password': 'synthetic-password'}
        with patch.object(agent, 'preflight', return_value=config['domain']), patch.object(agent, 'panel_dependencies') as deps, patch.object(agent.pathlib, 'Path', return_value=path), patch.object(agent, 'run', side_effect=command) as run, patch.object(agent, 'write') as write, patch.object(agent, 'download'), patch.object(agent, 'certificate'), patch.object(agent.tarfile, 'open'), patch.object(agent.os, 'chmod'), patch.object(agent.os, 'symlink'), patch.object(agent, 'step'):
            result = agent.install_panel(config)
        deps.assert_called_once_with('ubuntu-22.04')
        commands = [call.args[0] for call in run.call_args_list]
        self.assertTrue(any(c[:2] == [agent.PHP, '/usr/bin/composer'] and 'install' in c for c in commands))
        self.assertTrue(any(c[0] == agent.PHP and 'migrate' in c for c in commands))
        self.assertTrue(any(c[:2] == [agent.PHP, '-r'] for c in commands))
        self.assertFalse(any(c[0] in ['php', 'composer'] for c in commands))
        content = {c.args[0]: c.args[1] for c in write.call_args_list}
        self.assertIn('/usr/bin/php8.3 ', content['/etc/cron.d/pterodactyl'])
        self.assertIn('ExecStart=/usr/bin/php8.3 ', content['/etc/systemd/system/pteroq.service'])
        self.assertTrue(result['services_verified'])  # Mocked I/O, never a live installation claim.


if __name__ == '__main__':
    unittest.main()
