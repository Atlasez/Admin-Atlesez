---
articleId: ja-mathematics-ring-definition
locale: ja
title: 環の定義
slug: ring-definition
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.ring-definition
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  環の定義 定義 1 (環) を集合とする. 以下の条件を満たす組 を環(ring)という. - (二項演算の閉性) 上の閉じた二項演算
  が定まっている. - (結合法則) 次の結合法則が成り立つ. - (零元の存在)加法…
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 環の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 環の定義

定義 1 (環) $R$を集合とする. 以下の条件を満たす組$(R,+,0,-\bullet,\cdot)$を環(ring)という.

- (二項演算の閉性) $R$上の閉じた二項演算$+\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall x,y,z\in R, (x+y)+z=x+(y+z) \end{align*}
$$

- (零元の存在)加法単位元$0\in R$が存在して

$$
\begin{align*} \forall x\in R,\quad x+0=x \end{align*}
$$

- (加法逆元の存在)$R$上の閉じた単項演算$-\bullet\colon R\to R;\ x\mapsto -x$が存在して

$$
\begin{align*} \forall x\in R,\quad x+(-x)=0 \end{align*}
$$

- (加法の可換性)次の加法に関する交換法則が成り立つ.

$$
\begin{align*} \forall x,y\in R,\quad x+y=y+x \end{align*}
$$

- $R$上の閉じた二項演算$\cdot\;\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall x,y,z\in R, (x\cdot y)\cdot z=x\cdot (y\cdot z) \end{align*}
$$

乗法$\cdot\;\colon R\times R\to R$は双加法的である. すなわち以下が成り立つ.

- (左分配法則) 各 $x \in R$ に対し, 左乗法写像 $L_x: R \to R \ (y \mapsto x \cdot y)$ は加法群 $(R, +, 0,-\bullet)$ の準同型である. すなわち

$$
\begin{align*} \forall x, y, z \in R,\ x\cdot(y + z) = x\cdot y + x\cdot z \end{align*}
$$

- (右分配法則) 各 $z \in R$ に対し, 右乗法写像 $R_z: R \to R \ (x \mapsto x \cdot z)$ は加法群 $(R, +, 0,-\bullet)$ の準同型である. すなわち

$$
\begin{align*} \forall x, y, z \in R,\ (x + y)\cdot z = x\cdot z + y\cdot z \end{align*}
$$

上の環の定義では乗法の単位元$1$の存在を仮定していない. 乗法の単位元を持つ環, すなわち$(R,\cdot,1)$がモノイドをなすとき単位的環(unital ring)と呼ぶ. 一方, 単位元の存在を仮定しない環を非単位的環(non-unital ring, rng), 擬環(pseudo ring)と呼んで区別することもある.

$0$は零元または加法単位元, $1$は単位元または乗法単位元と呼ばれる. 特にそれらが環$R$におけるものであることを明確にしたい場合は$0_R, 1_R$と書く.

環は$(R,+,0,-\bullet,\cdot)$の組のことであるが, 加法単位元や加法逆元は一意に定まるので省略して$(R,+,\cdot)$と表す. 環$(R,+,\cdot)$は演算との組であるが, 演算が明らかで誤解が生じない場合は単に環$R$と言ったり, 環の乗法の記号を省略して$x\cdot y$を$xy$と書いたりすることもある.

### 可換環の定義

定義 2 (可換環) 環$R$の定義で, 特に$(R,\cdot)$が可換半群であるとき, すなわち乗法の可換性

$$
\begin{align*} \forall x,y\in R,\quad xy=yx \end{align*}
$$

が成り立つとき, $R$を可換環(commutative ring)という. 可換でない環を非可換環(non-commutative ring)という.

### 単位元と逆元の一意性

環の定義「$(R,+,0,-\bullet)$は可換群である」および単位的環の定義「$(R,\cdot,1)$はモノイドである」ことから群とモノイドの基本的性質として以下が成り立つ.

命題 3 (単位元, 逆元の一意性) 環$R$において, 加法単位元$0$と, 存在すれば乗法単位元$1$はそれぞれ一意的に定まる. また, 任意の$x\in R$に対して加法逆元$-x$は一意的に定まる.

### 定義から従う基本的な命題

命題 4 (定義から従う基本的な命題) $R$を環とする. 任意の$x,y\in R$に対し以下が成り立つ.

- $x\cdot 0=0,\quad 0\cdot x=0$

- $(-x)y=x(-y)=-(xy)$

- $(-x)(-y)=xy$

証明.

- $0$は加法単位元であるから$0=0+0$である. 左分配法則より

$$
\begin{align*} x\cdot 0=x\cdot (0+0)=x\cdot 0+x\cdot 0 \end{align*}
$$

となるので$0=x\cdot 0$が分かる. 同様に$0$は加法単位元であるから$0=0+0$である. 右分配法則より

$$
\begin{align*} 0\cdot x=(0+0)\cdot x=0\cdot x+0\cdot x \end{align*}
$$

となるので$0=0\cdot x$が分かる.

- 分配法則より

$$
\begin{align*} (-x)y+xy=(-x+x)y=0\cdot y \end{align*}
$$

1.  より$0\cdot y=0$であるから$(-x)y=-(xy)$が分かる. 同様にして1. より

$$
\begin{align*} x(-y)+xy=x(-y+y)=x\cdot 0=0 \end{align*}
$$

なので$(-x)y=-(xy)$, $x(-y)=-(xy)$が分かる.

- 2. を用いることで

$$
\begin{align*} (-x)(-y)=-(x(-y))=-(-(xy))=xy \end{align*}
$$

であることから分かる.

◻

### 零環

ただ一つの元からなる集合$\{\ast\}$は$\ast+\ast:=\ast$, $\ast\cdot \ast=\ast$と定めることで環, 特に単位的環になる. このとき$\{\ast\}$の加法単位元と乗法単位元はともに$\ast$である. この環を零環(zero ring)といい, その元は通常$0$で表す.

逆に, 環$R$において加法単位元$0$と乗法単位元$1$が一致しているとき, 任意の$x\in R$は

$$
\begin{align*} x=1\cdot x=0\cdot x=0 \end{align*}
$$

となるので$R=\{0\}$が分かる. つまり零環は加法単位元と乗法単位元が一致する唯一の環である.
