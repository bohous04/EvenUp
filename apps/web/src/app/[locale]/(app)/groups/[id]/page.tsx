import { GroupDetail } from '@/components/group-detail';

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ already?: string }>;
}) {
  const { id } = await params;
  const { already } = await searchParams;
  // Read here rather than with `useSearchParams()` in the client component,
  // which would need a Suspense boundary around the whole group detail.
  return <GroupDetail groupId={id} alreadyMemberNotice={already === '1'} />;
}
