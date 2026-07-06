// app.config.js
require("dotenv").config();

const IS_DEV = process.env.APP_ENV === "development";
const IS_PREVIEW = process.env.APP_ENV === "preview";

const getBundleId = () => {
  // if (IS_DEV) return "com.navigo.ke.dev";
  // if (IS_PREVIEW) return "com.navigo.ke.preview";
  return "com.navigo.ke";
};

module.exports = {
  expo: {
    name: "Navigo",
    slug: "navigo",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/navigo.png",
    scheme: "navigo",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      usesAppleSignIn: true,
      bundleIdentifier: "com.navigo.ke",
      appleTeamId: "R7YXJ7XRCN",
      associatedDomains: [
        "applinks:navigo.co.ke"
      ],
      buildNumber: "1",
      supportsTablet: false,
      // iOS Maps Config
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Navigo uses your location to show nearby transit stops, plan routes, and display your position on the map.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Navigo uses your location in the background to track your journey, announce upcoming stops, and alert you when to board or alight, even when the app is not on screen.",
        NSLocationAlwaysUsageDescription: "Navigo uses your location in the background to track your journey, announce upcoming stops, and alert you when to board or alight, even when the app is not on screen.",
        NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to use your camera to take transit stop photos and update your profile picture.",
        NSPhotoLibraryUsageDescription: "Allow $(PRODUCT_NAME) to access your photo library to upload stop photos and choose a profile picture.",
        NSPhotoLibraryAddUsageDescription: "Allow $(PRODUCT_NAME) to save photos to your library.",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["location", "remote-notification", "audio"],
        NSMicrophoneUsageDescription: "Navigo uses your microphone so you can speak your destination to the built-in AI trip-planning assistant.",
        NSSpeechRecognitionUsageDescription: "Navigo transcribes your voice so the AI assistant can understand your destination and plan your matatu journey.",
      },
    },

    android: {
      package: "com.navigo.ke",
      googleServicesFile: "./google-services.json",
      intentFilters: [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "navigo.co.ke",
              "pathPrefix": "/route"
            }
          ],
          "category": [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ],
      versionCode: 1,
      // Android Maps Config (Added to fix potential blank map issues)
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        },
      },
      adaptiveIcon: {
        backgroundColor: "#E6F4FE", 
        foregroundImage: "./assets/images/navigo-android.png",
        monochromeImage: "./assets/images/navigo-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "FOREGROUND_SERVICE_DATA_SYNC",
        "POST_NOTIFICATIONS",
        "VIBRATE",
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      // Raise iOS deployment target — required by @notifee (iOS 15+) and ActivityKit (iOS 16.1+)
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.1",
          },
        },
      ],
      // Phase 3 extension targets — iOS ActivityKit + WidgetKit, Android Glance widget
      "@bacons/apple-targets",
      require("./plugins/withLiveActivity"),
      require("./plugins/withAndroidWidget"),
      "expo-asset",
      "expo-router",
      "expo-secure-store",
      "expo-task-manager",
      "expo-apple-authentication",
      "expo-audio",
      "expo-quick-actions",
      [
        "@sentry/react-native/expo",
        {
          organization: "navigo-k5",
          project: "react-native",
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Navigo uses the camera for AR walking guidance, a live view with a direction arrow to your stage.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photo library to upload stop photos and choose a profile picture.",
          cameraPermission: "Allow $(PRODUCT_NAME) to use your camera to take transit stop photos and update your profile picture.",
          isAccessMediaLocationEnabled: true,
        },
      ],
      [
        "expo-calendar",
        {
          calendarPermission: "Navigo reads your upcoming events so the AI assistant can plan trips to your meetings.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to use your location to show nearby stops and pick map locations.",
          backgroundPermission: "Navigo uses your location in the background to keep your journey on track.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/navigo.png",
          color: "#FF6F00",
          iosDisplayInForeground: true,
        },
      ],
      [
        "@rnmapbox/maps",
        { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? "" },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      router: {},
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      eas: {
        projectId: "4f1cbaeb-8f43-4f47-9479-ac2fde23a3c2",
      },
    },

    owner: "navigo-kenya",
  },
};