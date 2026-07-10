'use client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@evenup/api';

export const trpc = createTRPCReact<AppRouter>();

/** Inferred output types of every query/mutation, e.g. RouterOutputs['transaction']['list']. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
