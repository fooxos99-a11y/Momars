import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TraineePage = () => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)] text-foreground">
      <div className="container py-10 md:py-14">
        <Card className="mx-auto max-w-4xl border-primary/10 bg-white/90 shadow-soft">
          <CardHeader className="text-right">
            <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">حساب المتدرب</Badge>
            <CardTitle className="text-2xl md:text-4xl">لوحة المتدرب</CardTitle>
            <CardDescription>
              تم التعرف على نوع الحساب كمتدرب. يمكنك الانتقال مباشرة إلى الاختبارات أو صفحة التكاليف المستقلة.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/course/pre">الاختبار القبلي</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/course/post">الاختبار البعدي</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/tasks">التكاليف</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TraineePage;