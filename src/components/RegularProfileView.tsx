import CustomerProfileView from "./CustomerProfileView";

interface RegularProfileViewProps {
  customerId: string;
  onProfileUpdated?: () => void;
}

export default function RegularProfileView({
  customerId,
  onProfileUpdated,
}: RegularProfileViewProps) {
  return (
    <CustomerProfileView
      customerId={customerId}
      onProfileUpdated={onProfileUpdated}
    />
  );
}
