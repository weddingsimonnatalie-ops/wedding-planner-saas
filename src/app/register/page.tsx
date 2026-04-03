import RegisterClient from "./RegisterClient";

// Server component - checks PayPal config and passes to client
export default function RegisterPage() {
  // PayPal is configured if both client ID and secret are set
  const paypalConfigured = !!(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET
  );

  return <RegisterClient paypalConfigured={paypalConfigured} />;
}