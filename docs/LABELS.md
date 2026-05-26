# 🏷️ Label Management System

PathFinder AI uses a structured labeling system to categorize issues and pull requests, making it easier for contributors and maintainers to manage the workflow.

## 🚀 Automation

The repository uses GitHub Actions to automate labeling:
- **Issue Labeler**: Automatically labels issues based on keywords in the title and body.
- **PR Labeler**: Automatically labels pull requests based on the files changed and the PR title.
- **Label Sync**: Maintains a consistent set of labels across the repository.

---

## 📊 Label Categories

### 🛠️ Type Labels (Stackable)
These labels define the nature of the work. Multiple type labels can be applied.

| Label | Description |
| :--- | :--- |
| `type:bug` | Something isn't working as expected. |
| `type:feature` | New functionality or feature requests. |
| `type:docs` | Improvements or additions to documentation. |
| `type:testing` | Adding or improving tests (Jest, Cypress, etc.). |
| `type:security` | Security-related issues or vulnerabilities. |
| `type:performance` | Performance optimizations and speed improvements. |
| `type:design` | UI/UX design changes and styling. |
| `type:refactor` | Code refactoring without changing behavior. |
| `type:devops` | CI/CD, GitHub Actions, and infrastructure. |
| `type:accessibility` | Improving accessibility (A11y). |

---

### 📶 Difficulty Labels (Required — Pick One)
These labels represent the complexity of the task.

| Label | Description |
| :--- | :--- |
| `level:beginner` | Ideal for first-time contributors. Simple and well-defined. |
| `level:intermediate` | Requires familiarity with the codebase and logic. |
| `level:advanced` | Complex tasks requiring deep architectural understanding. |
| `level:critical` | Urgent, high-impact, and complex issues. |

---

### 🌟 Quality Labels
Used to recognize exceptional contributions.

| Label | Description |
| :--- | :--- |
| `quality:clean` | Code that meets high cleanliness and readability standards. |
| `quality:exceptional` | Outstanding contribution that goes above and beyond. |

---

### 📂 Domain Labels
Identifies the area of the codebase being modified.

| Label | Description |
| :--- | :--- |
| `frontend` | React components, UI, and styling. |
| `backend` | API routes, Server Actions, and business logic. |
| `database` | Prisma schema, migrations, and database queries. |
| `ai` | Gemini API integrations and AI prompt engineering. |
| `ui/ux` | User experience, animations, and visual design. |

---

### 🎓 Program Labels
Special labels for open-source programs.

| Label | Description |
| :--- | :--- |
| `Gssoc` | GirlScript Summer of Code contributions. |
| `good first issue` | Curated list of issues for newcomers. |
| `help wanted` | Tasks where maintainers are seeking extra help. |

---

## 🛠️ For Maintainers

To sync labels from the configuration, you can manually trigger the **Label Sync** workflow from the Actions tab.

The configuration is managed in:
- `.github/labels.json`: List of all labels with colors and descriptions.
- `.github/labeler.yml`: File-based labeling rules for PRs.
- `.github/workflows/issue-labeler.yml`: Keyword-based labeling for issues.
