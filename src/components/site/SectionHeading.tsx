interface Props {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "right";
}

const SectionHeading = ({ eyebrow, title, description, align = "center" }: Props) => {
  return (
    <div className={`mb-14 ${align === "center" ? "text-center mx-auto max-w-2xl" : "text-right max-w-2xl"}`}>
      {eyebrow && (
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-soft text-accent-foreground text-sm font-semibold mb-4`}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          {eyebrow}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-extrabold text-foreground leading-tight mb-4">
        {title}
      </h2>
      {description && (
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
};

export default SectionHeading;
