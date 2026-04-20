import { useEffect, useState } from 'react';

const MIN_WIDTH = 1024;

interface ViewportGuardProps {
  children: React.ReactNode;
}

export function ViewportGuard({ children }: ViewportGuardProps) {
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    function check() {
      setTooSmall(window.innerWidth < MIN_WIDTH);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (tooSmall) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background p-8"
        data-testid="viewport-guard"
      >
        <div className="max-w-sm text-center space-y-3">
          <p className="text-4xl">&#x26A0;&#xFE0F;</p>
          <h2 className="text-lg font-semibold text-foreground">Bildschirm zu klein</h2>
          <p className="text-sm text-muted-foreground">
            Der Payments Generator benötigt mindestens {MIN_WIDTH} px Bildschirmbreite. Bitte
            vergrößern Sie das Fenster oder verwenden Sie ein Gerät mit größerem Display.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
