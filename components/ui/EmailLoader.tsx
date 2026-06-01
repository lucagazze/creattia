import React from 'react';
import { AppleLoader } from './AppleLoader';

interface Props {
  loading: boolean;
  color?: string;
  labels?: string[];
  children?: React.ReactNode;
}

/**
 * Backward-compatible wrapper for the metric card loaders that unifies
 * them to use the premium AppleLoader.
 */
export default function EmailLoader({ loading, labels, children }: Props) {
  if (!loading && children) {
    return <>{children}</>;
  }

  return (
    <div className="animate-in fade-in duration-300">
      <AppleLoader variant="metrics" labels={labels} loading={loading} />
    </div>
  );
}
