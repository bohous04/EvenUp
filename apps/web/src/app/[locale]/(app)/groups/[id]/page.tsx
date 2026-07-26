import { GroupDetail } from '@/components/group-detail';

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetail groupId={id} />;
}
