'use client';

import { RouteError, type RouteErrorProps } from '@/components/route-error';

export default function RootError({ retry }: RouteErrorProps) {
  return <RouteError retry={retry} />;
}
