import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/SearchInput";

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-muted rounded">
            <Search className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold mb-2">404</h1>
        <h2 className="text-xl text-muted-foreground mb-6">Page Not Found</h2>
        
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or the Safe/transaction 
          couldn't be found.
        </p>

        <div className="space-y-4">
          <SearchInput placeholder="Try searching..." className="max-w-sm mx-auto" />
          
          <div className="flex justify-center gap-4">
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
