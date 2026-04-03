import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

export const isNativeMobile = (): boolean => Capacitor.isNativePlatform();

export const getDeviceLocation = async (): Promise<{ lat: number; lng: number }> => {
  if (isNativeMobile()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
      throw new Error("Location permission denied");
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => reject(new Error("Unable to fetch browser location")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
};

export const scanIncrementQrPayload = async (): Promise<string | null> => {
  if (!isNativeMobile()) {
    return window.prompt("Paste QR payload for web fallback (example: location-id)")?.trim() ?? null;
  }

  const permissions = await BarcodeScanner.requestPermissions();

  if (permissions.camera !== "granted") {
    throw new Error("Camera permission denied");
  }

  const { barcodes } = await BarcodeScanner.scan();
  const first = barcodes[0]?.rawValue?.trim();
  return first || null;
};
