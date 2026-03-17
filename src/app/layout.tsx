import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from 'next-themes';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HomeBase',
  description: 'Your homebuying journey, organized.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
