---
articleId: ja-mathematics-conjugation-actions
locale: ja
title: 共役作用
slug: conjugation-actions
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.conjugation-actions
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  共役作用の定義 定義 1 (共役作用). 群 の 自身への作用で以下の条件を満たすものを共役作用(conjugation),
  随伴作用(adjoint action)という. - 一般の群 に対しては自明とは限らない作用…
difficulty: intermediate
estimatedMinutes: 30
tags:
  - 共役作用
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 共役作用の定義

定義 1 (共役作用). 群$G$の$G$自身への作用で以下の条件を満たすものを共役作用(conjugation), 随伴作用(adjoint action)という.

- 一般の群$G$に対しては自明とは限らない作用である.

- 作用が$G$内の積と逆元をとる演算のみで定まる.

- 作用が準同型として定まる. つまり任意の$g,x,y\in G$に対して$g.(xy)=(g. x)(g. y)$が成り立つ.

共役作用の置換表現は$\operatorname{Ad}\colon G\to \mathop{\mathrm{Sym}}(G)$で表す.

単に共役作用と言えば左作用のことを指すことが多い. 次の命題により共役作用は一意に定まることが分かる.

命題 2 (共役作用の表示). 群$G$における共役作用は$g\in G, x\in G$として次で与えられる作用に限られる.

$$
\begin{align*} g. x:=gxg^{-1}\;\text{または}\;x.g:=g^{-1}xg \end{align*}
$$

証明. 上の条件で群の作用が左作用になっているものを考える.

2.の条件を満たすとき, $e.x=x$であることより$i,j\in\mathbb{Z}$によって

$$
\begin{align*} g.x=g^i x g^j \end{align*}
$$

と表される. 作用が準同型として作用するので

$$
\begin{align*} (g.x)(g.y) &= g^i x g^{i+j} y g^j \\ g.(xy) &= g^i xy g^j \end{align*}
$$

が一致する. よって$g^{i+j}=e$であるが, これが一般の群$G$において成り立つのは$i+j=0$に限られる.

次に左作用の定義から

$$
\begin{align*} (g_1g_2).x &= (g_1g_2)^i x (g_1g_2)^{-i} \\ (g_1.(g_2.x)) &= g_1^i (g_2^i x g_2^{-i}) g_1^{-i} = g_1^i g_2^i x g_2^{-i} g_1^{-i} \end{align*}
$$

が一致する. つまり$(g_1g_2)^i=g_1^i g_2^i$であるが, これが一般の群$G$において成り立つのは$i=0,1$に限られる. $i=0$のとき, 得られた群の作用は自明な作用である. $i=1$のときは非自明な作用になるのでこれが共役作用である. $g.x=gxg^{-1}$が実際に$G$の$G$自身への左作用であることは$e.x=x$と

$$
\begin{align*} (g_1g_2). x &= (g_1g_2)x(g_1g_2)^{-1} \\ g_1.(g_2. x) &= g_1.(g_2xg_2^{-1}) = g_1g_2xg_2^{-1}g_1^{-1} \end{align*}
$$

より分かる. 作用が右作用になっているときも同様の議論なので以下の補足に記す.

補足 上の条件で群の作用が右作用になっているものを考える.

2.の条件を満たすとき, $x.e=x$であることより$i,j\in\mathbb{Z}$によって

$$
\begin{align*} x.g=g^i x g^j \end{align*}
$$

と表される. 作用が準同型として作用するので

$$
\begin{align*} (x.g)(y.g) &= g^i x g^{i+j} y g^j \\ (xy).g &= g^i xy g^j \end{align*}
$$

が一致する. よって$g^{i+j}=e$であるが, これが一般の群$G$において成り立つのは$i+j=0$に限られる.

次に右作用の定義から

$$
\begin{align*} x.(g_1g_2) &= (g_1g_2)^i x (g_1g_2)^{-i} \\ (x.g_1).g_2 &= g_2^i (g_1^i x g_1^{-i}) g_2^{-i} = g_2^i g_1^i x g_1^{-i} g_2^{-i} \end{align*}
$$

が一致する. つまり$(g_1g_2)^i=g_2^i g_1^i$であるが, これが一般の群$G$において成り立つのは$i=0,-1$に限られる. $i=0$のとき, 得られた群の作用は自明な作用である. $i=-1$のときは非自明な作用になるのでこれが共役作用である. $x.g=g^{-1}xg$が実際に$G$の$G$自身への右作用であることは$x.e=x$と

$$
\begin{align*} x.(g_1g_2) &= (g_1g_2)^{-1}x(g_1g_2) \\ (x.g_1).g_2 &= g_2^{-1}(g_1^{-1}xg_1)g_2 = g_2^{-1} g_1^{-1} x g_1 g_2 = (g_1g_2)^{-1}xg_1g_2 \end{align*}
$$

より分かる.

◻

アーベル群における共役作用は常に自明な作用になることに注意する.

各$g\in G$に対して定まる自己同型写像$\operatorname{Ad}(g)\colon x\mapsto gxg^{-1}$は$\operatorname{Ad}_g$と書き, $g\in G$の定める$G$の内部自己同型写像(inner automorphism)という.

### 群の元の共役

定義 3 (群の元の共役). 群$G$の元$x$に対し, $g\in G$により定まる元

$$
\begin{align*} x^g:=g^{-1}xg \end{align*}
$$

を$x$の$g$による共役(conjugate)という. 群$G$の二つの元$x,y$が共役であるとは, ある共役作用によって一方をもう一方に移すことができること, すなわちある$g\in G$が存在して

$$
\begin{align*} y=x^g \end{align*}
$$

と表されることである.

命題 4 (共役の性質). $G$を群として, 任意の$x,y,g,h\in G$に対し

$$
\begin{align*} (x^g)^h=x^{gh},\quad (xy)^g=x^gy^g,\quad (x^{-1})^g=(x^g)^{-1} \end{align*}
$$

が成り立つ.

証明. 共役作用の定義よりただちに従うが, 次の計算により確かめることができる.

$$
\begin{align*} (x^g)^h &= (g^{-1}xg)^h=h^{-1}g^{-1}xgh=(gh)^{-1}x(gh)=x^{gh} \\ (xy)^g &= g^{-1}(xy)g=(g^{-1}xg)(g^{-1}yg)=x^gy^g \\ (x^{-1})^g &= g^{-1}x^{-1}g=(g^{-1}xg)^{-1}=(x^g)^{-1} \end{align*}
$$

このことは共役作用$x.g=g^{-1}xg$が右作用で準同型として作用することを意味している. ◻

補足 $g^{-1}xg$は$x^g$と表すのに対して, $gxg^{-1}$は${}^gx$と表すことがある.

### 共役集合と共役部分群の定義

群$G$における共役作用によって$G$のべき集合$2^G$にも作用を定めることができる([群の作用の性質と例:例 4]).

定義 5 (共役集合). 群$G$の部分集合$S$に対し, $g\in G$により定まる部分集合

$$
\begin{align*} S^g:=\{s^g\mid s\in S\} \end{align*}
$$

を$S$の$g$による共役集合(conjugate set)という. 群$G$の二つの部分集合$S,T$が共役であるとは, 共役作用によって一方をもう一方に移すことができること, すなわちある$g\in G$が存在して

$$
\begin{align*} T=S^g \end{align*}
$$

と表されることである.

命題 6. $S,T$を群$G$の部分集合として, 任意の$g,h\in G$に対し

$$
\begin{align} (S^g)^h=S^{gh},\quad (ST)^g=S^g T^g \end{align}
$$

が成り立つ.

証明. [共役作用:命題 4]を用いて示す. 一つ目の式について次のように確かめることができる.

$$
\begin{align*} (S^g)^h &= \{(s^g)^h\mid s\in S\} \\ &= \{s^{gh}\mid s\in S\} = S^{gh} \end{align*}
$$

次に二つ目の式についても次で確かめられる.

$$
\begin{align*} (ST)^g &= \{(st)^g\mid s\in S,t\in T\} \\ &= \{s^gt^g\mid s\in S,t\in T\}=S^g T^g \end{align*}
$$

◻

命題 7 (共役部分群). $H$を群$G$の部分群とすると, 任意の$g\in G$に対し共役集合$H^g$も$G$の部分群である. $H^g$を$H$の$g$による共役部分群(conjugate subgroup)という.

証明. まず$e= e^g\in H^g$である. 次に任意の$h_1^g,h_2^g\in H^g$に対して, [共役作用:命題 4]により

$$
\begin{align*} h_1^g (h_2^g)^{-1} = h_1^g (h_2^{-1})^g = (h_1 h_2^{-1})^g \end{align*}
$$

であり, 仮定より$h_1h_2^{-1}\in H$なので$(h_1 h_2^{-1})^g\in H^g$である. よって$H^g$は$G$の部分群である. ◻

特に任意の共役作用によって変化しない, すなわち$H^g=H$となる$G$の部分群$H$を$G$の正規部分群という([正規部分群, 剰余群の定義:定義 1]).
