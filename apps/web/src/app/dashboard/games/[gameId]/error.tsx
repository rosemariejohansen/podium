'use client';

import { RouteError, type RouteErrorProps } from '@/components/route-error';

export default function GameError({ retry }: RouteErrorProps) {
  return <RouteError retry={retry} />;
}
