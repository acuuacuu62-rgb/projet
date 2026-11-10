import ssh2 from "ssh2";
export function generateSSHKey(
  algorithm: "ed25519" | "rsa",
  passphrase?: string,
) {
  return new Promise<{ private: string; public: string }>((resolve, reject) => {
    const options: ssh2.utils.KeyPairOptions = passphrase
      ? { passphrase, cipher: "aes256-ctr", rounds: 32 }
      : {};
    const callback = (
      err: Error | null,
      keys: { private: string; public: string },
    ) => (err ? reject(err) : resolve(keys));
    if (algorithm === "rsa")
      ssh2.utils.generateKeyPair("rsa", { ...options, bits: 4096 }, callback);
    else ssh2.utils.generateKeyPair("ed25519", options, callback);
  });
}
