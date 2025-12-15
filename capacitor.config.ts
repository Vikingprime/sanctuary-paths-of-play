import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.sanctuaryrun',
  appName: 'sanctuary-paths-of-play',
  webDir: 'dist',
  server: {
    url: 'https://31617073-9afc-4c5e-923a-05bc57b0413f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
