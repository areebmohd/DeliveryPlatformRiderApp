# 🛵 Delivery Platform Rider App

[![React Native](https://img.shields.io/badge/React_Native-0.84.1-61DAFB?style=flat-square&logo=react)](https://reactnative.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Messaging-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

A high-performance, real-time delivery management application built for riders. This app enables riders to manage deliveries, track earnings, navigate using real-time maps, and handle returns efficiently.

---

## ✨ Key Features

- **📊 Dynamic Dashboard**: Real-time overview of active orders, daily earnings, and performance metrics.
- **📍 Real-time Tracking**: Integrated with **Mappls (MapmyIndia)** for precise navigation and live location updates.
- **📦 Delivery Management**: Complete lifecycle of a delivery from pickup to drop-off with QR code verification.
- **🔄 Returns Handling**: Dedicated interface for managing product returns and reverse logistics.
- **💰 Earnings & Payments**: Transparent payout history, earning breakdowns, and payment status tracking.
- **🔔 Smart Notifications**: Push notifications for new orders, status updates, and important alerts via **Firebase & Notifee**.
- **👤 Profile Management**: Comprehensive rider profile setup, including document verification and vehicle details.
- **🛠️ Support System**: Built-in support screen for quick assistance.

---

## 🚀 Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) (v0.84.1)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Backend-as-a-Service**: [Supabase](https://supabase.com/) (Database & Auth)
- **Maps & Location**: [Mappls React Native SDK](https://www.mappls.com/)
- **Push Notifications**: [Firebase Messaging](https://firebase.google.com/docs/cloud-messaging) & [Notifee](https://notifee.app/)
- **Storage**: [React Native Async Storage](https://react-native-async-storage.github.io/async-storage/)
- **Icons**: [React Native Vector Icons](https://github.com/oblador/react-native-vector-icons)
- **Vector Graphics**: [React Native SVG](https://github.com/software-mansion/react-native-svg)

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 22.11.0)
- [React Native Environment Setup](https://reactnative.dev/docs/set-up-your-environment)
- Android Studio / Xcode (for native builds)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd riderApp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory and add your keys (refer to `.env.example`):
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   MAP_SDK_KEY=your_mappls_sdk_key
   ```

4. **iOS Setup (Mac only)**
   ```bash
   cd ios && pod install && cd ..
   ```

### Running the App

- **Android**
  ```bash
  npm run android
  ```
- **iOS**
  ```bash
  npm run ios
  ```
- **Start Metro Bundler**
  ```bash
  npm start
  ```

---

## 📂 Project Structure

```text
riderApp/
├── src/
│   ├── assets/       # Images, Fonts, and static assets
│   ├── components/   # Reusable UI components
│   ├── context/      # React Context for state management (Auth, Theme)
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # External library initializations (Supabase, etc.)
│   ├── navigation/   # Navigation configurations (Stack, Tabs)
│   ├── screens/      # Functional application screens
│   ├── theme/        # Global styles and color constants
│   ├── types/        # TypeScript interfaces and types
│   └── utils/        # Helper functions and constants
├── android/          # Android native project files
└── ios/              # iOS native project files
```

---

## 📝 License

This project is private and proprietary. All rights reserved.

---

## 🤝 Support

For support or queries, please reach out via the in-app support screen or contact the development team.

