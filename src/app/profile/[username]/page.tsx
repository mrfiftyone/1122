import { redirect } from "next/navigation";

interface ProfileProps {
  params: Promise<{ username: string }>;
}

export default async function ProfilePage({ params }: ProfileProps) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username || "");
  redirect(`/?profile=${encodeURIComponent(decodedUsername)}`);
}
