// The cloud providers notes can be backed up to. Only Google Drive for now; another
// provider is one more module with the same shape as google.js, added to PROVIDERS:
//   name, label, isConfigured(), authorizeUrl(), exchangeCode(), refresh(),
//   getAccount(), getRoot(), createFolder(), uploadFile(), move(), remove(), revoke().
// Refs (remote ids) are opaque strings to everything outside the provider module.
import google from './google.js';

const PROVIDERS = { [google.name]: google };
const overrides = {};

export function getProvider(name) {
    return overrides[name] ?? PROVIDERS[name] ?? null;
}

export function listProviders() {
    return Object.keys(PROVIDERS).map(getProvider);
}

export function anyProviderConfigured() {
    return listProviders().some((p) => p.isConfigured());
}

// Tests swap a provider for a fake (same shape); pass null to restore it.
export function setProviderForTests(name, fake) {
    if (fake) overrides[name] = fake;
    else delete overrides[name];
}
