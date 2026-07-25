---
articleId: ja-mathematics-group-definition
locale: ja
title: 群の定義
slug: group-definition
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.group-definition
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  ここではまず群の定義を行い, 別の同値な定式化についても触れる. そして定義から直接的に導かれる基本的事実について確認する.
  その中で基本的な記法の導入も行う. 群の定義 定義 1 (群). を集合とする. 以下の条件を…
difficulty: intermediate
estimatedMinutes: 45
tags:
  - 群の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

ここではまず群の定義を行い, 別の同値な定式化についても触れる. そして定義から直接的に導かれる基本的事実について確認する. その中で基本的な記法の導入も行う.

### 群の定義

定義 1 (群). $G$を集合とする. 以下の条件を満たす組$(G,\cdot,e,{}^{-1})$を(group)という.

- (二項演算の閉性) $G$上の閉じた二項演算$\cdot\;\colon G\times G\to G$が定まっている(つまり$(G,\cdot)$がマグマである).

- (結合法則) 1.を満たす$(G,\cdot)$に対し, 次の結合法則が成り立つ.

$$
\begin{align*} \forall x,y,z\in G,\quad (x\cdot y)\cdot z=x\cdot (y\cdot z) \end{align*}
$$

- (左/右単位元の存在) ある$e\in G$が存在して

$$
\begin{align*} \forall x\in G,\quad e\cdot x=x,\quad(\text{または}x\cdot e=x) \end{align*}
$$

が成り立つ. この$e$を$G$の左単位元(left identity element)(または右単位元(left identity element))という.

- (左/右逆元の存在) 3.を満たす$(G,\cdot ,e)$に対し, $G$上の閉じた単項演算${}^{-1}\colon G\to G;\,x\mapsto x^{-1}$が定まっていて, 任意の$x\in G$に対し

$$
\begin{align*} x^{-1}\cdot x=e,\quad(\text{または}x\cdot x^{-1}=e) \end{align*}
$$

が成り立つ. この$x^{-1}$を$x$の左逆元(left inverse element)(または右逆元(left inverse element))という.

群$(G,\cdot,e,{}^{-1})$には単位元が存在するので, $G$は空集合ではないことが定義から従う.

群は$(G,\cdot,e,{}^{-1})$の組のことであるが, 後に示すように群において単位元や逆元は一意に定まるのでこれらを省略して$(G,\cdot)$と表す. 群$(G,\cdot)$は演算との組であるが, 演算が明らかで誤解が生じない場合は単に群$G$と言ったり, 群の演算の記号を省略して$x\cdot y$を$xy$と書いたりすることもある.

### 可除律による群の特徴づけ

群を定義するとき, 単位元の存在と逆元の存在の代わりに次に示す可除律を要請することもできる.

命題 2 (可除律による群の特徴づけ). $G$を空でないマグマとするとき結合法則と左右の可除律

$$
\begin{align*} \forall a,b \in G,\,\exists x,y\in G,\,ax=b,\,ya=b \end{align*}
$$

が成り立つならば単位元および逆元が存在する.

証明. 可除律より$a\in G$に対してある$e_r,e_l\in G$で$a e_r=a,\,e_l a=a$となるものが存在する. ここで任意に$x\in G$をとれば再び可除律より

$$
\begin{align*} x=ap,\quad x=qa \end{align*}
$$

となる$p,q\in G$が存在する. このとき結合法則を用いて次のようにできる.

$$
\begin{align*} x=qa=q(ae_r)=(qa)e_r=xe_r \\ x=ap=(e_la)p=e_l(ap)=e_lx \end{align*}
$$

特にそれぞれ$x=e_l,e_r$とすれば$e_l=e_le_r=e_r$が分かるので$e_r=e_l=e$とおけば任意の$x\in G$に対して

$$
\begin{align*} x=xe=ex \end{align*}
$$

が成り立つ. よってこの$e$が$G$の単位元である. 逆に単位元と逆元が存在するときは可除律が成り立つこともわかる. ◻

補足 準群(結合法則は成り立たないが可除律が成り立つ)において単位元が存在するとは限らない. 実際次の演算表を持つ準群がある

$$
\begin{align*} \begin{array}{c|cccc} & a & b & c & d \\ \hline a & c & b & a & d \\ b & b & a & d & c \\ c & a & d & c & b \\ d & d & c & b & a \end{array} \end{align*}
$$

結合法則が成り立たないことは

$$
\begin{align*} (ac)d=ad=d,\quad a(cd)=ab=b \end{align*}
$$

からわかる. そしてこの準群は単位元を持たないことも演算表からわかる.

### アーベル群の定義

定義 3 (アーベル群). 群$(G,\cdot)$において, 任意の$x,y\in G$が交換法則:

$$
\begin{align*} \forall x,y\in G,\quad x\cdot y=y\cdot x \end{align*}
$$

を満たすとき$(G,\cdot,e,{}^{-1})$をアーベル群(abelian group)または可換群(commutative group)という. アーベル群でない群は非アーベル群(non-abelian group)または非可換群(non-commutative group)という. 特にアーベル群の演算は加法(addition)と呼び, $+$で書くことも多い.

### 結合法則から従う演算の略記

結合法則により$(xy)z=x(yz)$なのでこれをかっこを省略して$xyz$とかく. 結合法則が成り立つことから次のような略記がwell-definedであることが従う. $G$を群として$x\in G$に対し, $n$を正の整数として

$$
\begin{align*} x^n:=\underbrace{xx\cdots xx}_{\text{$n$個}},\quad x^0:=e,\quad x^{-n}:=\underbrace{x^{-1}x^{-1}\cdots x^{-1}x^{-1}}_{\text{$n$個}} \end{align*}
$$

のように表す. $(G,+)$がアーベル群であるときにも同様の次の略記を用いる.

$$
\begin{gather*} nx=\underbrace{x+x+\cdots +x+x}_{\text{$n$個}},\quad 0x=0:=e \\ -x:=x^{-1},\quad -nx:=\underbrace{x^{-1}+x^{-1}+\cdots +x^{-1}+x^{-1}}_{\text{$n$個}} \end{gather*}
$$

### 両側単位元と両側逆元の存在

$G$を空でないマグマで結合法則が成り立つものとするとき, 次の条件を満たす$e\in G$を$G$の両側単位元(two-sided identity element)または単に単位元(identity element)という.

$$
\begin{align*} \forall x\in G,\quad ex=xe=x \end{align*}
$$

また, $x\in G$に対し次の条件を満たすような$x^{-1}\in G$を$x$の両側逆元(two-sided inverse element)または単に逆元(inverse element)という.

$$
\begin{align*} x^{-1}x=xx^{-1}=e \end{align*}
$$

命題 4 (両側単位元と両側逆元の存在). 群$G$に定められた左単位元と左逆元(または右単位元と右逆元)はそれぞれ両側単位元, 両側逆元である.

証明. 左単位元$e$と$x\in G$の左逆元$x^{-1}\in G$が存在すると仮定する. $x^{-1}x=e$の両辺に$x^{-1}$を右からかけることで

$$
\begin{align*} x^{-1}x &= e \\ (x^{-1}x)x^{-1} &= ex^{-1} \\ x^{-1}(xx^{-1}) &= x^{-1} \end{align*}
$$

さらに$x^{-1}$の左逆元が存在するのでそれを$x^*$とすれば, $x^*$を左からかけることで

$$
\begin{align*} x^*(x^{-1}(xx^{-1})) &= x^*x^{-1} \\ ((x^*x^{-1})x)x^{-1} &= e \\ (ex)x^{-1} &= e \\ xx^{-1} &= e \end{align*}
$$

次に, 今得られた$xx^{-1}=e$の両辺に右から$x$をかけることで

$$
\begin{align*} (xx^{-1})x &= ex \\ x(x^{-1}x) &= x \\ xe &= x \end{align*}
$$

以上より$e$は$G$の両側単位元であり, $x^{-1}$は$x$の両側逆元である.

右単位元, 右逆元の場合の証明は以下の補足に記す.

補足 右単位元$e$と$x\in G$の右逆元$x^{-1}\in G$が存在すると仮定する. $xx^{-1}=e$の両辺に$x^{-1}$を左からかけることで

$$
\begin{align*} x^{-1}x &= e \\ x^{-1}(xx^{-1}) &= x^{-1}e \\ (x^{-1}x)x^{-1} &= x^{-1} \end{align*}
$$

さらに$x^{-1}$の右逆元が存在するのでそれを$x^*$とすれば, $x^*$を右からかけることで

$$
\begin{align*} ((x^{-1}x)x^{-1})x^* &= x^{-1}x^* \\ x^{-1}(x(x^{-1}x^*)) &= e \\ x^{-1}(xe) &= e \\ x^{-1}x &= e \end{align*}
$$

次に, 今得られた$x^{-1}x=e$の両辺に左から$x$をかけることで

$$
\begin{align*} x(x^{-1}x) &= xe \\ (xx^{-1})x &= x \\ ex &= x \end{align*}
$$

以上より$e$は両側単位元であり, $x^{-1}$は$x$の両側逆元である.

◻

これらの事実から, 以降は単位元と言えば両側単位元を指し, 逆元と言えば両側逆元を指すものとする.

### 単位元, 逆元の一意性

命題 5 (単位元, 逆元の一意性). 群$G$の単位元はただ一つである. 任意の$x\in G$に対する逆元は各$x$に対しただ一つ定まる.

証明. まず$e_1,e_2\in G$をともに単位元とする. すなわち次の二つの式が任意の$x\in G$で成立すると仮定する.

$$
\begin{align*} e_1x=xe_1=x,\quad e_2x=xe_2=x \end{align*}
$$

このとき$e_1$が単位元であるという条件において$x=e_2$とすれば$e_1e_2=e_2$を得る. 同様にして$e_2$が単位元であるという条件において$x=e_1$とすれば$e_1e_2=e_1$を得る. 以上より$e_1=e_2$, すなわち単位元がただ一つであることが示された.

次に$x\in G$として$x_1,x_2$がともに$x$の逆元であるとすると, 単位元$e$を用いて

$$
\begin{align*} xx_1=x_1x=e,\quad xx_2=x_2x=e \end{align*}
$$

が成り立つ. このことから

$$
\begin{align*} xx_1=xx_2 \end{align*}
$$

である. この両辺に$x_1$(または$x_2$)をかければ関係式$x_1x=e$と結合法則を用いて

$$
\begin{align*} x_1(xx_1) &= x_1(xx_2) \\ (x_1x)x_1 &= (x_1x)x_2 \\ x_1 &= x_2 \end{align*}
$$

となる. よって逆元の一意性も示された. ◻

### 逆元の性質

命題 6 (逆元の性質). $G$を群とする. $x,y\in G$に対して次が成り立つ.

$$
\begin{align*} e^{-1}=e,\quad (xy)^{-1}=y^{-1}x^{-1},\quad (x^{-1})^{-1}=x \end{align*}
$$

証明. 単位元の定義$ex=xe=x$において$x=e$とすれば

$$
\begin{align*} ee=e \end{align*}
$$

これは$e$が$e$自身の逆元であることを表しているので$e^{-1}=e$. 次に$y^{-1}x^{-1}$が$xy$の逆元であることを示す. 結合律を用いれば次のように計算できる.

$$
\begin{align*} (xy)(y^{-1}x^{-1})=x(yy^{-1})x=xx^{-1}=e \\ (y^{-1}x^{-1})(xy)=y(x^{-1}x)y=y^{-1}y=e \end{align*}
$$

よって$(xy)^{-1}=y^{-1}x^{-1}$が成り立つ. $(x^{^-1})^{-1}=x$は$x^{-1}$の定義式$xx^{-1}=x^{-1}x=e$が$x^{-1}$の逆元が$x$であることを表していることから従う. ◻

命題 7 (簡約律). $G$を群とする. このとき$a,x,y\in G$として以下の簡約律が成り立つ.

$$
\begin{align*} ax=ay\Longleftrightarrow x=y\\ xa=ya\Longleftrightarrow x=y \end{align*}
$$

証明. $x=y$であるとき, 両辺に左から$a$, 右から$a$をそれぞれかけることで$ax=ay$, $xa=ya$が得られる. $ax=ay$ならば両辺に左から$a^{-1}$をかけることで

$$
\begin{align*} a^{-1}(ax) &= a^{-1}(ay) \\ (a^{-1}a)x &= (a^{-1}a)y \\ x &= y \end{align*}
$$

が得られる. 同様に$xa=ya$であるときも, 両辺に右から$a^{-1}$をかけることで$x=y$が得られる. ◻

### 有限群, 無限群の定義

定義 8 (有限群, 無限群). 群$G$が有限個の元からなるとき$G$を有限群(finite group)という. このとき$G$の集合としての濃度$|G|$を$G$の位数(order)という. 群$G$が有限群でないとき$G$を無限群(infinite group)という.

### 群の部分集合の積

$S,T$を$G$の部分集合とする. このとき群の演算を用いて部分集合$S$, $T$の積を

$$
\begin{align*} ST:=\{st\mid s\in S,t\in T\} \end{align*}
$$

と定める. これは再び$G$の部分集合になっている. 特に$g\in G$に対して$\{g\}S$を$gS$, $S\{g\}$を$Sg$と表す.
