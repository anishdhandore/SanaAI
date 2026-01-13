% Intro Options
\ProvidesClass{deedy-resume-reversed}[2018/09/22 CV class]
\NeedsTeXFormat{LaTeX2e}
\DeclareOption{print}{\def\@cv@print{}}
\DeclareOption*{%
  \PassOptionsToClass{\CurrentOption}{article}
}
\ProcessOptions\relax
\LoadClass{article}

% Package Imports
\usepackage[hmargin=1.25cm, vmargin=0.75cm]{geometry}
\usepackage[hidelinks]{hyperref}

% Publications
\usepackage{cite}
\renewcommand\refname{\vskip -1.5cm}

% Color definitions
\usepackage[usenames,dvipsnames]{xcolor}
\definecolor{date}{HTML}{666666}
\definecolor{primary}{HTML}{2b2b2b}
\definecolor{headings}{HTML}{6A6A6A}
\definecolor{subheadings}{HTML}{333333}

% Set main fonts
\usepackage{fontspec}
\setmainfont[Color=primary, Path = fonts/lato/,BoldItalicFont=Lato-BolIta,BoldFont=Lato-Bol,ItalicFont=Lato-RegIta]{Lato-Reg}
\setsansfont[Scale=MatchLowercase,Mapping=tex-text, Path = fonts/raleway/]{Raleway-ExtraLight}

% Date command
\usepackage[absolute]{textpos}
\usepackage[UKenglish]{isodate}
\setlength{\TPHorizModule}{1mm}
\setlength{\TPVertModule}{1mm}
\newcommand{\lastupdated}{\begin{textblock}{60}(155,5)
\color{date}\fontspec[Path = fonts/raleway/]{Raleway-ExtraLight}\fontsize{8pt}{10pt}\selectfont
Last Updated on \today
\end{textblock}}

% Name command
\newcommand{\namesection}[2]{
\centering{
\fontsize{40pt}{60pt}
\fontspec[Path = fonts/lato/]{Lato-Lig}\selectfont #1
} \\[5pt]
\centering{
\color{headings}
\fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{14pt}\selectfont #2}
\noindent\makebox[\linewidth]{\color{headings}\rule{\paperwidth}{0.4pt}}
\vspace{-8pt}
}

% Section seperators
\usepackage{titlesec}
\titlespacing{\section}{0pt}{0pt}{0pt}
\titlespacing{\subsection}{0pt}{0pt}{0pt}
\newcommand{\sectionsep}{\vspace{8pt}}

% Headings command
\titleformat{\section}{\color{headings}
\scshape\fontspec[Path = fonts/lato/]{Lato-Reg}\fontsize{16pt}{24pt}\selectfont \raggedright\uppercase}{}{0em}{}

% Subeadings command
\titleformat{\subsection}{
\color{subheadings}\fontspec[Path = fonts/lato/]{Lato-Bol}\fontsize{12pt}{12pt}\selectfont\bfseries\uppercase}{}{0em}{}

\newcommand{\runsubsection}[1]{
\color{subheadings}\fontspec[Path = fonts/lato/]{Lato-Bol}\fontsize{12pt}{12pt}\selectfont\bfseries\uppercase {#1} \normalfont}

% Descriptors command
\newcommand{\descript}[1]{
\color{subheadings}\raggedright\scshape\fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont {#1 \\} \normalfont}

% Location command
\newcommand{\location}[1]{
\color{subheadings}\raggedright\fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{10pt}{12pt}\selectfont {#1\\} \normalfont}

% Bullet Lists with fewer gaps command
\newenvironment{tightemize}{
\vspace{-\topsep}\begin{itemize}\itemsep1pt \parskip0pt \parsep0pt}
{\end{itemize}\vspace{-\topsep}}

% --- Minimal font-size reduction (~10%) ---

% (Optional) Slightly tighter line spread — safe, not aggressive
\linespread{0.98}

% Name block a bit smaller
\makeatletter
\renewcommand{\namesection}[2]{%
  \centering{%
    \fontsize{34pt}{48pt}% was 40/60
    \fontspec[Path = fonts/lato/]{Lato-Lig}\selectfont #1%
  } \\[4pt]%
  \centering{%
    \color{headings}%
    \fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{9.5pt}{12pt}\selectfont #2% was 11/14
  }%
  \noindent\makebox[\linewidth]{\color{headings}\rule{\paperwidth}{0.4pt}}%
  \vspace{-13pt}% was -15pt
}
\makeatother

% Section / subsection headings smaller
\titleformat{\section}{\color{headings}
\scshape\fontspec[Path = fonts/lato/]{Lato-Reg}\fontsize{14pt}{20pt}\selectfont \raggedright\uppercase}{}{0em}{}

\titleformat{\subsection}{
\color{subheadings}\fontspec[Path = fonts/lato/]{Lato-Bol}\fontsize{10.5pt}{11pt}\selectfont\bfseries\uppercase}{}{0em}{}

\renewcommand{\runsubsection}[1]{%
\color{subheadings}\fontspec[Path = fonts/lato/]{Lato-Bol}\fontsize{10.5pt}{11pt}\selectfont\bfseries\uppercase {#1} \normalfont}

% Descriptor & location slightly smaller
\renewcommand{\descript}[1]{%
\color{subheadings}\raggedright\scshape\fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{10pt}{12pt}\selectfont {#1 \\} \normalfont}

\renewcommand{\location}[1]{%
\color{subheadings}\raggedright\fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{9pt}{11pt}\selectfont {#1\\} \normalfont}

% --- Ultra-light one-page squeeze (add at end) ---

% 1) Gain ~8mm of vertical room without touching margins
\addtolength{\textheight}{8mm}

% 2) Make section separators a touch tighter
\renewcommand{\sectionsep}{\vspace{8pt}} % was 8pt

% 3) Nudge headings down one notch (tiny change)
\titleformat{\section}{\color{headings}
\scshape\fontspec[Path = fonts/lato/]{Lato-Reg}\fontsize{13pt}{18pt}\selectfont \raggedright\uppercase}{}{0em}{}

% 4) Tighten bullet lists slightly (vertical)
\renewenvironment{tightemize}{%
  \vspace{-\topsep}%
  \begin{itemize}\itemsep0pt \parskip0pt \parsep0pt \topsep1pt \partopsep0pt
}{%
  \end{itemize}\vspace{-\topsep}%
}

% 5) Reduce bullet left indent (horizontal wrap reduction)
\setlength{\leftmargini}{1.2em} % default ~2.5em
\setlength{\labelsep}{0.4em}     % space between bullet and text

% 6) Slightly smaller name (very subtle)
\makeatletter
\renewcommand{\namesection}[2]{%
  \centering{%
    \fontsize{33pt}{46pt}\fontspec[Path = fonts/lato/]{Lato-Lig}\selectfont #1%
  } \\[3pt]%
  \centering{%
    \color{headings}%
    \fontspec[Path = fonts/raleway/]{Raleway-Medium}\fontsize{9.5pt}{12pt}\selectfont #2%
  }%
  \noindent\makebox[\linewidth]{\color{headings}\rule{\paperwidth}{0.4pt}}%
  \vspace{-8pt}%
}
\makeatother
