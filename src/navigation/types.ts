export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ProfileSetup: { isEditing?: boolean };
  MainTabs: undefined;
  Notifications: undefined;
  DeliveryMap: { orderId: string };
};
