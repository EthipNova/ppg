import CustomerProfileView from "./CustomerProfileView";

interface AerobicsProfileViewProps {
  customerId: string;
  onProfileUpdated?: () => void;
}

export default function AerobicsProfileView({
  customerId,
  onProfileUpdated,
}: AerobicsProfileViewProps) {
  return (
    <CustomerProfileView
      customerId={customerId}
      onProfileUpdated={onProfileUpdated}
    />
  );
}
