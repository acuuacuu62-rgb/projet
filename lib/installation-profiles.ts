export const installationProfiles = ["ubuntu-24.04", "ubuntu-22.04"] as const;
export type InstallationProfile = (typeof installationProfiles)[number];

export function detectedProfile(evidence?: {
  os_id?: string;
  os_version?: string;
}): InstallationProfile | undefined {
  if (evidence?.os_id !== "ubuntu") return;
  return installationProfiles.find(
    (profile) => profile === `ubuntu-${evidence.os_version}`,
  );
}

export function profileLabel(profile: InstallationProfile) {
  return profile === "ubuntu-22.04" ? "Ubuntu 22.04 LTS" : "Ubuntu 24.04 LTS";
}
