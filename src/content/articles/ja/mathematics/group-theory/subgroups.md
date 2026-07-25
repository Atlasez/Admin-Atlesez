---
articleId: ja-mathematics-subgroups
locale: ja
title: 部分群の定義
slug: subgroups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.subgroups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  ここではまず部分群の定義を行い, より簡潔な必要十分条件を示す. そして部分群の共通部分, 和集合, 積が部分群となる条件について触れる.
  部分群の定義 定義 1 (部分群) が群 の部分群(subgroup)であるとは…
difficulty: intermediate
estimatedMinutes: 35
tags:
  - 部分群の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

ここではまず部分群の定義を行い, より簡潔な必要十分条件を示す. そして部分群の共通部分, 和集合, 積が部分群となる条件について触れる.

### 部分群の定義

定義 1 (部分群) $H$が群$G$の部分群(subgroup)であるとは, $G$の部分集合$H$が$G$の演算によって群をなす, すなわち$G$における演算の$H$における制限$\cdot|_H$によって$(H,\cdot|_H)$が群となることである. このことを$H\leq G$とかく.

命題 2 $H$を$G$の部分群とする. このとき次が成り立つ.

- $H$の単位元は$G$における単位元と等しい.

- $x\in H$の$H$における逆元は, $x$の$G$における逆元と等しい.

証明.

- $G$の単位元を$e_G$, $H$の単位元を$e_H$とする. このとき$e_G$が単位元であり, $e_H\in G$でもあるから

$$
\begin{align*} e_He_G=e_H \end{align*}
$$

が成り立つ. $e_He_H=e_H$であるので

$$
\begin{align*} e_He_G=e_He_H \end{align*}
$$

である. $e_H$の$G$における逆元$e_H^{-1}$を左からかけることで

$$
\begin{align*} e_G=e_H \end{align*}
$$

が得られる.

- $x\in H$の$H$における逆元を$x^{(-1)_H}$とすると$x\in G$とみて

$$
\begin{align*} xx^{(-1)_G}=x^{(-1)_G}x=e_G=e_H \end{align*}
$$

が成り立つ. $H$についての群の逆元の一意性より$x^{(-1)_H}=x^{(-1)_G}$が従う. すなわち${}^{(-1)_H}={}^{(-1)_G}|_H$, 部分群$H$において逆元を返す写像は$G$におけるものの$H$における制限写像である.

◻

例 3 (自明な部分群) 任意の群$G$に対して$\{e\},G$はともに$G$の部分群である. これらを$G$の自明な部分群(trivial subgroup)という. 自明でない部分群は真の部分群(proper subgroup)という.

### 部分群であることの同値な条件

$(H,\cdot|_H)$が群$G$の部分群であるとは, 定義に従えば(1)積の閉性(2)結合律(3)単位元の存在(4)逆元の存在の条件が満たされることである. ここで$H$が群$G$の構造の部分であることを用いれば, より簡潔な条件へと省いたり言い換えたりすることができる.

命題 4 (部分群であることの同値な条件) $G$の部分集合$H$が$G$の部分群である必要十分条件は以下の条件が成り立つことである. ただし$x^{(-1)_G}$は$G$における$x$の逆元を表す.

- $H$は空集合でない.

- $\forall x,y\in H,\, x\cdot_G y\in H$.

- $\forall x\in H,\, x^{(-1)_G}\in H$.

証明. $H$が部分群であるとき1.2.3.が成り立つことは定義から明らかである. 逆に1.2.3.が成り立つときに部分群の[部分群の定義:定義 1]の条件が成り立つことを確認する. まず2.より演算で閉じていることが分かり, 結合法則は任意の$x,y,z\in G$で

$$
\begin{align*} (xy)z=x(yz) \end{align*}
$$

が成り立っていたから特に$x,y,z\in H$としても成立している. 次に1.より$H$は空でないので$x\in H$がとれる. このとき3.より$x,x^{-1}\in H$なので2.を用いれば

$$
\begin{align*} xx^{-1}=e_G \in H \end{align*}
$$

であり$e_G$は任意の$x_H\in H$に対し$x_He_G=e_Gx_H=x_H$より$H$における単位元でもあるので, $H$に単位元が存在することが分かる. さらに任意の$x\in H$に対して逆元が$H$に存在することが3.によりわかるため, $H$は$G$の演算で群をなす. ◻

上の条件はさらにまとめることができ, より簡潔かつ実用的である.

命題 5 (部分群であることの同値な条件) $G$の部分集合$H$が$G$の部分群である必要十分条件は以下の条件が成り立つことである. ただし$x^{(-1)_G}$は$G$における$x$の逆元を表す.

- $H$は空集合でない.

- $\forall x,y\in H,\,x\cdot_G y^{(-1)_G}\in H$.

証明. 上の[部分群の定義:命題 5]の2.の条件が成り立つとき[部分群の定義:命題 4]の2.3.の条件が成り立つことを示す. まず1.より$H$は空集合ではないため$x\in H$に対して$xx^{-1}=e_G\in H$である. $e_G$は任意の$x_H\in H$に対し$x_He_G=e_Gx_H=x_H$より$H$における単位元でもあるので, $H$に単位元が存在することが分かる. 次に$x\in H$に対して, $x^{-1}=ex^{-1}\in H$が成り立つ. また, $x,y\in H$に対して$y^{-1}\in H$なので$xy=x(y^{-1})^{-1}\in H$である. ◻

命題 6 (部分群であることの同値な条件) $H$を$G$に含まれる群とする. このとき次が成り立つ.

$$
\begin{align*} \text{$H$は$G$の部分群}\iff\text{包含写像$\iota\colon H\to G$が準同型写像} \end{align*}
$$

証明. まず$H$が$G$の部分群であると仮定する. $x,y\in H$とする. このとき$H$における演算は$G$における演算の制限であることから$\iota(xy)=xy\in G$である. 一方$\iota(x)=x,\iota(y)=y$なので$\iota(xy)=\iota(x)\iota(y)$が成り立つ. 逆に包含写像が準同型写像であるとき$\iota(xy)=\iota(x)\iota(y)$である. 右辺は$G$における演算で, 左辺は$H$における演算かつ$\iota(x)=x, \iota(y)=y$なのでこれは$G$の演算の$H$による制限が$H$における演算となっているので$H$は$G$の部分群である. ◻

### 部分群の共通部分と和集合

以下では部分群の集合としての演算が部分群となる条件について考える.

命題 7 (部分群の共通部分は部分群) $\{H_{\lambda}\}_{\lambda\in\Lambda}$を$G$の部分群の族とする. このときこれらの共通部分$\bigcap_{\lambda\in\Lambda}H_{\lambda}$は$G$の部分群である.

証明. 任意の$\lambda\in\Lambda$に対し$H_{\lambda}$は$G$の部分群なので$e\in H_{\Lambda}$である. よって$e\in \bigcap_{\lambda\in\Lambda}H_{\lambda}$である. また$x,y\in \bigcap_{\lambda\in\Lambda}H_{\lambda}$とすると各$H_{\lambda}$は$G$の部分群なので任意の$\lambda\in\Lambda$に対して$xy\in H_{\lambda}$である. 同様に任意の$\lambda\in\Lambda$に対して$x^{-1}\in H_{\lambda}$なので, [部分群の定義:命題 4]より$\bigcap_{\lambda\in\Lambda}H_{\lambda}$は$G$の部分群である. ◻

命題 8 (部分群の和集合が部分群になる必要十分条件) $H_1,H_2$を$G$の部分群とする. このとき次が成り立つ.

$$
\begin{align*} H_1\cup H_2\text{が$G$の部分群}\iff H_1\subset H_2\text{または}H_1\supset H_2 \end{align*}
$$

証明. $H_1\subset H_2$のとき$H_1\cup H_2=H_2$, $H_1\supset H_2$のとき$H_1\cup H_2=H_1$より$H_1\cup H_2$は部分群であることが直ちに従う. 次に$H_1\cup H_2$が$G$の部分群であると仮定する. 背理法で示す. $H_1\not\subset H_2$かつ$H_1\not\supset H_2$とすると, ある$h_1\in H_1,h_2\in H_2$で$h_1\not\in H_2,h_2\not\in H_1$となるものが存在する. $h_1,h_2\in H_1\cup H_2$なので仮定より$h_1h_2\in H_1\cup H_2$である. しかし$h_1h_2\in H_1$とすると$h_2=h_1^{-1}(h_1h_2)\in H_1$となり矛盾. 同様に$h_1h_2\in H_2$とすると$h_1=(h_1h_2)h_2^{-1}\in H_2$となり矛盾. 以上より$H_1\subset H_2$または$H_1\supset H_2$である. ◻

例 9 $\mathbb{Z}$の部分群として互いに包含関係のない$2\mathbb{Z}$と$3\mathbb{Z}$をとる. このとき, これらの共通部分$2\mathbb{Z}\cap 3\mathbb{Z}=6\mathbb{Z}$は$\mathbb{Z}$の部分群である. 一方$2+3\not\in2\mathbb{Z}\cup 3\mathbb{Z}$であるから, 和集合$2\mathbb{Z}\cup 3\mathbb{Z}$は$\mathbb{Z}$の部分群ではない.

### 部分群の積

命題 10 (部分群の積) $H,K$を$G$の部分群とする. このとき次が成り立つ.

$$
\begin{align*} HK\text{が$G$の部分群}\iff HK=KH \end{align*}
$$

証明. $HK=KH$が成り立つとする. このとき任意に$h_1k_1,h_2k_2\in HK$をとる. 仮定より$k_1h_2=h_2'k_1'$となる$k_1',h_2'$が存在して

$$
\begin{align*} (h_1k_1)(h_2k_2)=h_1(k_1h_2)k_2=h_1(h_2'k_1')k_2=(h_1h_2')(k_1'k_2)\in HK \end{align*}
$$

また, 逆元について$h_1^{-1}\in H,k_1^{-1}\in K$であって, 仮定より$(h_1k_1)^{-1}=k_1^{-1}h_1^{-1}\in KH=HK$. 以上より[部分群の定義:命題 4]より$HK$が$G$の部分群であることが分かる. 逆に$HK$が$G$の部分群であるとき, 任意の$hk\in HK$に対して$(hk)^{-1}=h^{-1}k^{-1}\in HK$である. よってある$h'\in H, k'\in K$が存在して$h'k'=h^{-1}k^{-1}$と表せるので$hk=k'^{-1}h'^{-1}\in KH$つまり$HK\subset KH$が分かる. 逆の包含も同様にわかるので$HK=KH$が示された. ◻
