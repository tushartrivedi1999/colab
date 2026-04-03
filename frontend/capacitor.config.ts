import { CapacitorConfig } from "@capacitor/core";

const config: CapacitorConfig = {
  appId: "com.example.heatrelief",
  appName: "HeatReliefGeoPlatform",
  webDir: "out",
  bundledWebRuntime: false,
  ios: {
    contentInset: "always"
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
