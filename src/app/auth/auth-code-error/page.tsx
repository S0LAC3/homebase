import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AuthCodeError() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Authentication Error</h1>
        <p className="text-muted-foreground">Something went wrong during sign-in. Please try again.</p>
        <Button>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
