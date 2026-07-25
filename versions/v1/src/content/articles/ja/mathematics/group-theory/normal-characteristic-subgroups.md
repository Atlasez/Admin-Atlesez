---
articleId: ja-mathematics-normal-characteristic-subgroups
locale: ja
title: 正規部分群と特性部分群
slug: normal-characteristic-subgroups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.normal-characteristic-subgroups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  正規部分群の定義 定義 1 (正規部分群). を群 の部分群とする. が任意の共役作用で不変, すなわち任意の に対して が成り立つとき は
  の正規部分群(normal subgroup)であるという. このことを と表…
difficulty: intermediate
estimatedMinutes: 45
tags:
  - 正規部分群と特性部分群
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 正規部分群の定義

定義 1 (正規部分群). $H$を群$G$の部分群とする. $H$が任意の共役作用で不変, すなわち任意の$g\in G$に対して

$$
\begin{align*} gHg^{-1}=H \end{align*}
$$

が成り立つとき$H$は$G$の正規部分群(normal subgroup)であるという. このことを$H\vartriangleleft G$と表す.

定義からわかるようにアーベル群の部分群は全て正規部分群である. また群$G$の部分群として$\{e\},G$を考えるとこれらは常に$G$の正規部分群である. $\{e\},G$を自明な正規部分群という.

定義 2 (単純群). 自明でない群$G$の正規部分群が$G,\{e_G\}$のみであるとき, $G$は単純群(simple group)であるという.

### 特性部分群の定義

定義 3 (特性部分群). $H$を群$G$の部分群とする. 任意の$\varphi \in\mathop{\mathrm{Aut}}(G)$に対して

$$
\begin{align*} \varphi(H)= H \end{align*}
$$

が成り立つとき$H$は$G$の特性部分群(characteristic subgroup)であるという. このことを$H\blacktriangleleft G$と表す.

内部自己同型写像は自己同型写像の特別な場合なので, 特性部分群は正規部分群である. また, 自明な正規部分群$\{e\}$, $G$は特性部分群でもある.

しばしば特性部分群であることを記号$H\mathrel{\mathrm{char}} G$と表すが, 包含関係をより明らかにするために$H\blacktriangleleft G$を用いることにする.

### 正規部分群と特性部分群であることの同値な条件

正規部分群であることの条件は, より簡潔な条件へと言い換えることができる. 特に次の命題の2. はよく用いられる.

命題 4 (正規部分群であることの同値な条件). $G$の部分群$H$に対して, 以下の条件は全て同値である.

- $H$は$G$の正規部分群である.

- 任意の$g\in G$に対して$gHg^{-1}\subset H$である.

- 任意の$g\in G$に対して$gH=Hg$である.

証明. 1. ならば2. は定義から直ちに従う.

2. が成り立つとき, 3. が成り立つことを示す. 仮定より, 任意の$gh\in gH$に対して$ghg^{-1}\in H$であるから$ghg^{-1}=h'$となる$h'\in H$を取れる. よって$gh=h'g\in Hg$となるので$gH\subset Hg$である. 逆に$hg\in Hg$をとる. このとき$g^{-1}hg\in H$であるから, $g^{-1}hg=h'$となる$h'\in H$を取れる. よって$hg=gh'\in gH$となるので$Hg\subset gH$である. 以上より3. が成り立つ.

3. が成り立つとき, 1. が成り立つことを示す. 任意の$h\in H, g\in G$に対して$gh\in gH=Hg$であるから, $gh=h'g$となる$h'\in H$を取れる. よって$ghg^{-1}=h'gg^{-1}=h'\in H$であるから$gHg^{-1}\subset H$である. 同様にして任意の$h\in H, g\in G$に対して$hg\in Hg=gH$であるから, $hg=gh'$となる$h'\in H$を取れる. よって$h=gh'g^{-1}$であるから$gHg^{-1}\supset H$である. ◻

命題 5 (特性部分群であることの同値な条件). $G$の部分群$H$に対して, 以下の条件は同値である.

- $H$は$G$の特性部分群である.

- 任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$に対して$\varphi(H)\subset H$である.

証明. 1. ならば2. は定義から直ちに従う.

2. が成り立つとき, 1. が成り立つことを示す. 任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$に対して, $\varphi$は全単射であるから, 任意の$h\in H$に対して$\varphi^{-1}(h)\in H$である. よって任意の$h\in H$に対して$h=\varphi(\varphi^{-1}(h))\in \varphi(H)$であるから$\varphi(H)\supset H$である. よって$\varphi(H)=H$なので$H$は$G$の特性部分群である. ◻

### 正規部分群と特性部分群の共通部分と積

命題 6 (正規部分群の共通部分と積).

- $\{N_{\lambda}\}_{\lambda\in\Lambda}$を$G$の正規部分群の族とする. このとき$\bigcap_{\lambda\in\Lambda}N_{\lambda}$は$G$の正規部分群である.

- $N_1,N_2$を$G$の正規部分群とする. このとき積$N_1N_2$は$G$の正規部分群である. さらに$N_1$は$N_1N_2$の正規部分群である.

証明.

- $\bigcap_{\lambda\in\Lambda}N_{\lambda}$が$G$の部分群であることは[部分群の定義:命題 7]より分かる. $g\in G$, $h\in \bigcap_{\lambda\in\Lambda}N_{\lambda}$とすると各$N_{\lambda}$の正規性から, 任意の$\lambda\in\Lambda$に対して$ghg^{-1}\in N_{\lambda}$である. すなわち$ghg^{-1}\in \bigcap_{\lambda\in\Lambda}N_{\lambda}$となることより$\bigcap_{\lambda\in\Lambda}N_{\lambda}$は$G$の正規部分群である.

- $N_1,N_2$は$G$の正規部分群なので$N_1N_2=N_2N_1$が成り立つ. [部分群の定義:命題 10]より$N_1N_2$は$G$の部分群である. さらに$g\in G$, $n_1n_2\in N_1N_2$に対して

$$
\begin{align*} g(n_1n_2)g^{-1}=(gn_1g^{-1})(gn_2g^{-1})\in N_1N_2 \end{align*}
$$

なので$N_1N_2$は$G$の正規部分群でもある. 次に$N_1$は$N_1N_2$の正規部分群であることを示す. $g\in N_1, n_1n_2\in N_1N_2$に対して

$$
\begin{align*} (n_1n_2)g(n_1n_2)^{-1}=n_1n_2gn_2^{-1}n_1^{-1} \end{align*}
$$

となるが$N_1$が$G$の正規部分群であるから$n_2gn_2^{-1}\in N_1$である. よって$(n_1n_2)g(n_1n_2)^{-1}\in N_1$だから$N_1$は$N_1N_2$の正規部分群である.

◻

命題 7 (特性部分群の共通部分と積).

- $\{H_{\lambda}\}_{\lambda\in\Lambda}$を$G$の特性部分群の族とする. このとき$\bigcap_{\lambda\in\Lambda}H_{\lambda}$は$G$の特性部分群である.

- $H_1,H_2$を$G$の特性部分群とする. このとき積$H_1H_2$は$G$の特性部分群である.

証明.

- 任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$, $h\in \bigcap_{\lambda\in\Lambda}H_{\lambda}$に対して各$H_{\lambda}$は$G$の特性部分群であるから, 任意の$\lambda\in\Lambda$に対して$\varphi(h)\in H_{\lambda}$である. すなわち$\varphi(h)\in \bigcap_{\lambda\in\Lambda}H_{\lambda}$となることより$\bigcap_{\lambda\in\Lambda}H_{\lambda}$は$G$の特性部分群である.

- $H_1,H_2$は$G$の特性部分群なので特に正規部分群でもある. よって$H_1H_2$は$G$の部分群である. さらに任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$, $h_1h_2\in H_1H_2$に対して

$$
\begin{align*} \varphi(h_1h_2)=\varphi(h_1)\varphi(h_2)\in H_1H_2 \end{align*}
$$

なので$H_1H_2$は$G$の特性部分群でもある.

◻

### 正規部分群の直積

命題 8 (正規部分群の直積は正規部分群). $N_1,N_2$をそれぞれ群$G_1,G_2$の正規部分群とする. このとき直積$N_1\times N_2$は$G_1\times G_2$の正規部分群である.

証明. 任意の$(g_1,g_2)\in G_1\times G_2$, $(n_1,n_2)\in N_1\times N_2$に対して

$$
\begin{align*} (g_1,g_2)(n_1,n_2)(g_1,g_2)^{-1}=(g_1n_1g_1^{-1},g_2n_2g_2^{-1})\in N_1\times N_2 \end{align*}
$$

なので$N_1\times N_2$は$G_1\times G_2$の正規部分群である. ◻

例 9. 特性部分群の直積は特性部分群になるとは限らない.

例えば自明でない群$G$の特性部分群として, $\{e\}, G$をとり$\{e\}\times G$を考える. 自己同型写像$\varphi\in \mathop{\mathrm{Aut}}(G\times G)$を$\varphi((x,y))=(y,x)$と定めると, $\varphi(\{e\}\times G)=G\times \{e\}\neq \{e\}\times G$であるからである.

### 正規部分群の非推移性と特性部分群の推移性

命題 10.

- $K\blacktriangleleft H,\ H\blacktriangleleft G$ならば$K\blacktriangleleft G$である.

- $K\blacktriangleleft H,\ H\vartriangleleft G$ならば$K\vartriangleleft G$である.

証明.

- 任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$に対し$\varphi(H)=H$である. よって$\varphi$を$H$へ制限した写像$\varphi|_H\colon H\to H$は$H$の自己同型写像である. すなわち$\varphi|_H(K)=K$であって, $K\subset H$から$\varphi(K)=K$となる. 以上より$K$は$G$の特性部分群である.

- 上の$\varphi$として内部自己同型写像を取ればよい.

◻

例 11. $K\unlhd H,\ H\unlhd G$ならば$K\unlhd G$は成り立つとは限らない.

例えば4次対称群$S_4$の正規部分群としてクラインの四元群$V_4$, $V_4$の正規部分群として互換$(1,2)$で生成される位数2の巡回群をとることができる. しかし$(1,2)$で生成される部分群は$S_4$の正規部分群ではない.

### 指数2の部分群は正規部分群

命題 12 (指数2の部分群は正規部分群). $G$を群, $H$を$G$の指数2の部分群であるとする. このとき$H$は$G$の正規部分群である.

証明. $G$の$H$による左剰余類分解と右剰余類分解を考えると, 指数が2であるということから剰余類の数は2つである. $g\not\in H$として

$$
\begin{align*} G=H\sqcup gH=H\sqcup Hg \end{align*}
$$

が成り立つ. 非交和であることから$g\not\in H$に対して$gH=Hg$が成り立つので$gHg^{-1}=H$である. 特に$g\in H$のときも$gHg^{-1}=H$は成り立つので$H$は$G$の正規部分群である. ◻

### 指数が位数と互いに素な正規部分群は特性部分群

命題 13 (指数が位数と互いに素な正規部分群は特性部分群). $G$を有限群, $N$を$G$の正規部分群とする. このとき$(G:N)$と$|N|$が互いに素であるならば, $N$は$G$の特性部分群である.

証明. [正規部分群と特性部分群:命題 5]より, 任意の$\varphi\in \mathop{\mathrm{Aut}}(G)$に対して$\varphi(N)\subset N$であることを示せばよい. $(G:N)=m$, $|N|=n$とおく.

任意の$g\in N$に対して$\varphi(g)$の位数は$g$の位数と等しく, Lagrangeの定理([剰余類とLagrangeの定理:定理 7])より$n=|N|$を割り切る. ここで剰余群$G/N$を考える. $\varphi(g)N$の位数を$k$とするとLagrangeの定理より$k$は$m=|G/N|=(G:N)$を割り切る. さらに$\varphi(g)$の位数を$k'$とすると

$$
\begin{align*} (\varphi(g)N)^{k'}=\varphi(g)^{k'}N=N \end{align*}
$$

であるから$k$は$k'$を割り切る. 特に$k'$は$n$を割り切るので, $k$は$n$も割り切る.

以上より$k$は$m$も$n$も割り切る. しかし$m,n$は互いに素なので$k=1$である. すなわち$\varphi(g)N=N$であって$\varphi(g)\in N$である. ◻

このように有限群の部分群で位数と指数が互いに素であるものはHall部分群(Hall subgroup)と呼ばれる.
