import { useState } from 'react';
import ProviderList from '@/components/external/ProviderList';
import ProviderProfile from '@/components/external/ProviderProfile';

export default function ExternalLab() {
  const [selectedProvider, setSelectedProvider] = useState(null);

  if (selectedProvider) {
    return <ProviderProfile provider={selectedProvider} onBack={() => setSelectedProvider(null)} />;
  }

  return <ProviderList onSelect={setSelectedProvider} />;
}