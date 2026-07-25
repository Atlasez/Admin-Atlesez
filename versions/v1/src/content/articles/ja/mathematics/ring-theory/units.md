---
articleId: ja-mathematics-units
locale: ja
title: 単元の定義
slug: units
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.units
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  単元の定義 定義 1 (単元, 可逆元) - 単位的環 の元 が左単元(left unit)または左可逆元(left invertible
  element)であるとは, となる左逆元 が存在することである. - 単位的環…
difficulty: intermediate
estimatedMinutes: 30
tags:
  - 単元の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 単元の定義

定義 1 (単元, 可逆元)

- 単位的環$R$の元$x$が左単元(left unit)または左可逆元(left invertible element)であるとは, $yx=1$となる左逆元$y\in R$が存在することである.

- 単位的環$R$の元$x$が右単元(right unit)または右可逆元(right invertible element)であるとは, $xy=1$となる右逆元$y\in R$が存在することである.

- 単位的環$R$の元$x$が左単元かつ右単元であるとき, 単元(unit)または可逆元(invertible element)と呼ぶ.

可換環では左可逆元と右可逆元の区別はない.

命題 2 $R$を単位的環とする. 単元$x\in R$の左逆元と右逆元は一致して, 環$R$内で一意的に定まる.

証明. $x\in R$が単元であるとき, ある$y,z\in R$が存在して$yx=1$かつ$xz=1$が成り立つ. このとき

$$
\begin{align*} y=y(xz)=(yx)z=z \end{align*}
$$

となるので左逆元$y$と右逆元$z$は一致する. また, $x\in R$の左逆元が$y'\in R$であるとすると

$$
\begin{align*} y' = y'(xy) = (y'x)y = y \end{align*}
$$

となるので左逆元は一意的に定まる. ◻

非可換環では左単元でも右単元とは限らない. 特に$x\in R$が左単元であるが右単元ではない場合, $x$の左逆元は唯一でないどころか無限に存在する場合がある.

例 3 $R$を単位的環として$x\in R$を左単元であるが右単元ではない元とする. このとき, ある$y\in R$が存在して$yx=1$かつ$xy\neq 1$が成り立つ. 整数$k\geq 1$に対して$y_k\in R$を

$$
\begin{align*} y_k = y + x^k(1-xy) \end{align*}
$$

と定めると$y_k$は$x$の相異なる左逆元である.

$$
\begin{align*} y_k x &= yx + x^k(1-xy)x \\ &= yx+x^k(x-xyx) \\ &= yx+x^{k+1}(1-yx) \\ &= 1 \end{align*}
$$

となるから$y_k$は$x$の左逆元である. また$k>l$かつ$y_k = y_l$が成り立つとする. このとき

$$
\begin{align*} x^k(1-xy) = x^l(1-xy) \end{align*}
$$

となるが両辺に左から$y^l$をかけると, $yx=1$であることから

$$
\begin{align*} x^{k-l}(1-xy) &= 1-xy \end{align*}
$$

さらに両辺に左から$y$をかけると$y(1-xy)=y-yxy=(1-yx)y=0$なので

$$
\begin{align*} yx^{k-l}(1-xy) &= 0 \end{align*}
$$

ここで$yx^{k-l}=(yx)x^{k-l-1}=x^{k-l-1}$となり, 左から$x$をかけることで

$$
\begin{align*} x^{k-l}(1-xy) &= 0 \end{align*}
$$

を得る. $x^{k-l}(1-xy)=1-xy$であったので$1-xy=0$となるがこれは$xy\neq 1$と矛盾する. よって$k\neq l$ならば$y_k\neq y_l$である.

### 単元であることの同値な条件

命題 4 (イデアルによる単元の特徴付け) 単位的環$R$の元$x$に対して次が成り立つ.

- $x$が左単元であることと, $Rx=R$であることは同値である.

- $x$が右単元であることと, $xR=R$であることは同値である.

- $x$が単元であることと, $Rx=R$かつ$xR=R$であることは同値である.

証明.

- $x$が左単元であるとき, ある$y\in R$が存在して$yx=1$が成り立つ. このとき任意の$r\in R$に対して$r=(ry)x\in Rx$であるから$Rx=R$が分かる. 逆に$Rx=R$のとき$1\in Rx$であるから, ある$y\in R$が存在して$1=yx$が成り立つ. よって$x$は左単元である.

- $x$が右単元であるとき, ある$y\in R$が存在して$xy=1$が成り立つ. このとき任意の$r\in R$に対して$r=(xy)r\in xR$であるから$xR=R$が分かる. 逆に$xR=R$のとき$1\in xR$であるから, ある$y\in R$が存在して$1=xy$が成り立つ. よって$x$は右単元である.

- 1. 2.より直ちに従う.

◻

命題 5 (極大イデアルによる単元の特徴づけ) 単位的環$R$の元$x$に対して次が成り立つ.

- $x$が左単元であることと, $x$を含む極大左イデアルが存在しないことは同値である.

- $x$が右単元であることと, $x$を含む極大右イデアルが存在しないことは同値である.

- $x$が単元であることと, $x$を含む極大イデアルが存在しないことは同値である.

証明.

- 対偶を示す. $x$が左単元でないと仮定すると[単元の定義:命題 4]より$Rx\neq R$である. よって$Rx$を含む極大左イデアル$\mathfrak{m}$が存在する. すると$x\in Rx\subset \mathfrak{m}$となる. 逆に$x$を含む極大左イデアルを$\mathfrak{m}$とすると, 任意の$y\in R$に対して$yx\in \mathfrak{m}$となるが, $\mathfrak{m}\neq R$より$Rx\neq R$である. [単元の定義:命題 4]より$x$は左単元でない.

- 対偶を示す. $x$が右単元でないと仮定すると, [単元の定義:命題 4]より$xR\neq R$である. よって$xR$を含む極大右イデアル$\mathfrak{m}$が存在する. すると$x\in xR\subset \mathfrak{m}$となる. 逆に$x$を含む極大右イデアルを$\mathfrak{m}$とすると, 任意の$y\in R$に対して$xy\in \mathfrak{m}$となるが, $\mathfrak{m}\neq R$より$xR\neq R$である. [単元の定義:命題 4]より$x$は右単元でない.

- 1. 2.より直ちに従う.

◻

### 単元に関する基本的な命題

命題 6 $R$を単位的環とする. $x\in R$が冪零元ならば$1-x, 1+x$は単元である.

証明. $x$が冪零元なので, ある正の整数$n$に対して$x^n=0$が成り立つ. すると

$$
\begin{align*} (1-x)(1+x+x^2+\cdots + x^{n-1})=1-x^n=1 \end{align*}
$$

となるので$1-x$は単元である. 同様にして

$$
\begin{align*} (1+x)(1-x+x^2-\cdots + (-1)^{n-1}x^{n-1})=1-(-1)^nx^n=1 \end{align*}
$$

となるので$1+x$は単元である. ◻

系 7 $R$を単位的環とする. $a\in R$が単元, $x\in R$が冪零元, $ax=xa$ならば$a-x, a+x$は単元である.

証明. $a$は単元なので$a^{-1}$が存在する. このとき$ax=xa$より$a^{-1}x=x a^{-1}$となり, $x^n=0$とすると

$$
\begin{align*} (a^{-1}x)^n = a^{-n}x^n=0 \end{align*}
$$

であるから$a^{-1}x$も冪零元であることが従う. よって$1-a^{-1}x$と$1+a^{-1}x$は[単元の定義:命題 6]より単元である. すると単元の積として

$$
\begin{align*} a-x=a(1-a^{-1}x),\quad a+x=a(1+a^{-1}x) \end{align*}
$$

と表されるので$a-x, a+x$は単元である. ◻

命題 8 $R$を単位的環, $x,y\in R$とする. このとき$1-xy$が左(または右)単元であることと, $1-yx$が左(または右)単元であることは同値である. 特に$1-xy$が単元であることと, $1-yx$が単元であることは同値である.

証明. まず$1-xy$が左逆元$z\in R$を持ち, $z(1-xy)=1$が成り立つとする. このとき$1-yx$の左逆元は$1+yzx$である. 実際,

$$
\begin{align*} (1+yzx)(1-yx) &= 1-yx+yzx(1-yx) \\ &= 1-yx+yz(x-xyx) \\ &= 1-yx+yz(1-xy)x \\ &= 1-yx+yx = 1 \end{align*}
$$

$x$と$y$を入れかえれば, $1-yx$が左単元ならば$1-xy$も左単元であることが分かる.

同様にして$1-xy$が右逆元$z\in R$を持つとき, $1-yx$の右逆元は$1+yzx$であることが分かる.

$$
\begin{align*} (1-yx)(1+yzx) &= 1-yx+(1-yx)yzx \\ &= 1-yx+(y-yxy)zx \\ &= 1-yx+y(1-xy)zx \\ &= 1-yx+yx = 1 \end{align*}
$$

$x$と$y$を入れかえれば, $1-yx$が右単元ならば$1-xy$も右単元であることが分かる. ◻
