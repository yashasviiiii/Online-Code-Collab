import Image from "next/image";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { REPO_URL } from "@/lib/constants";

interface ExternalLinkProps {
	forceDark?: boolean;
}

const ExternalLink = ({ forceDark = false }: ExternalLinkProps) => {
	const { resolvedTheme } = useTheme();

	if (!REPO_URL) {
		return null;
	}

	return (
		<Button asChild size="sm" variant="outline">
			<a
				aria-label="Visit CodeConnect GitHub repository (opens in new tab)"
				href={REPO_URL}
				rel="noopener noreferrer"
				target="_blank"
			>
				<Image
					alt="GitHub logo"
					className="mr-2"
					height={16}
					src={`/images/${resolvedTheme === "light" && !forceDark ? "octocat" : "octocat-white"}.svg`}
					width={16}
				/>
				Source Repository
			</a>
		</Button>
	);
};

export { ExternalLink };
