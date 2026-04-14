export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  VerifyEmailOTP: { email: string };
  VerifyResetOTP: { email: string };
  ResetPassword: { email: string };
  ProfileSetup: { isEditing?: boolean };
  MainTabs: undefined;
  Notifications: undefined;
  DeliveryMap: { orderId: string };
  Payments: undefined;
  Support: undefined;
};
