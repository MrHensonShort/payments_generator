import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Payments Generator</h1>
        <p className="text-muted-foreground">Aurora Dark Theme aktiv</p>
        <div className="flex gap-2 justify-center">
          <Badge>Standard</Badge>
          <Badge variant="income">+€1.234,56</Badge>
          <Badge variant="expense">-€567,89</Badge>
        </div>
        <Button>Los geht's</Button>
      </div>
    </div>
  );
}

export default App;
