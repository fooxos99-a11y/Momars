import About from "@/components/site/About";
import Competencies from "@/components/site/Competencies";
import Duration from "@/components/site/Duration";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import Hero from "@/components/site/Hero";
import Includes from "@/components/site/Includes";
import Requirements from "@/components/site/Requirements";
import Stats from "@/components/site/Stats";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Stats />
        <About />
        <Competencies />
        <Includes />
        <Requirements />
        <Duration />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
