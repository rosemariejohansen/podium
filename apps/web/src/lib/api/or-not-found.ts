import 'server-only';
import { notFound } from 'next/navigation';
import { ApiError } from './client';

/** The API answers 404 for missing *and* foreign resources; both become the Next.js 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
