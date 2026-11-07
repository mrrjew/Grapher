import { AuthPage } from '@/components/auth-page';
export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string }> }) { const params = await searchParams; return <AuthPage mode="login" notice={params.notice} />; }
