# Sources {.front-matter}

- [Transformer (deep learning architecture)](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture))
- [Attention (machine learning)](https://en.wikipedia.org/wiki/Attention_(machine_learning))
- [Large language model](https://en.wikipedia.org/wiki/Large_language_model)

# Transformer (deep learning architecture) {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture))* | *Author: Wikipedia contributors*
:::

![A standard transformer architecture, showing on the left an encoder, and on the right a decoder. Note: this uses the pre-LN convention, which is different from the post-LN convention used in the original 2017 transformer.](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/Transformer%2C_full_architecture.png/250px-Transformer%2C_full_architecture.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In [deep learning](https://en.wikipedia.org/wiki/Deep_learning "Deep learning"), the **transformer** is a family of [artificial neural network](https://en.wikipedia.org/wiki/Artificial_neural_network "Artificial neural network") architectures based on the multi-head [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism, in which input data such as text, images, or audio is converted to a sequence of numerical representations called [tokens](https://en.wikipedia.org/wiki/Large_language_model#Tokenization "Large language model"), and each token is converted into a vector through an embedding layer.[^c1fn1] At each layer, each [token](https://en.wikipedia.org/wiki/Tokenization_%28lexical_analysis%29 "Tokenization (lexical analysis)") is then [contextualized](https://en.wikipedia.org/wiki/Contextualization_%28computer_science%29 "Contextualization (computer science)") within the scope of the [context window](https://en.wikipedia.org/wiki/Context_window "Context window") with other (unmasked) tokens via a parallel multi-head attention mechanism, allowing the signal for key tokens to be amplified and less important tokens to be diminished. Because self-attention alone is permutation-invariant, transformers inject positional information, typically through [positional encodings](https://en.wikipedia.org/wiki/Positional_encoding "Positional encoding") or learned positional embeddings, so token order can affect the output.[^c1fn1]

Because transformers do not process tokens one at a time, their computations can be parallelized across sequence positions during training more readily than those of recurrent neural networks like [long short-term memory](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (LSTM).[^c1fn2] Later variations have been widely adopted for training [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model") (LLMs) on large (language) [datasets](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets "Training, validation, and test data sets").

The original version of the transformer architecture was proposed in the 2017 paper "[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")" by researchers at [Google](https://en.wikipedia.org/wiki/Google "Google").[^c1fn1] The predecessors of transformers were developed as an improvement over previous architectures for [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"),[^c1fn3][^c1fn4] but have found many applications since. They are used in large-scale [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), [computer vision](https://en.wikipedia.org/wiki/Computer_vision "Computer vision") ([vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer")), [reinforcement learning](https://en.wikipedia.org/wiki/Reinforcement_learning "Reinforcement learning"),[^c1fn5] [audio](https://en.wikipedia.org/wiki/Audio_signal_processing "Audio signal processing"),[^c1fn6] [multimodal learning](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning"), [robotics](https://en.wikipedia.org/wiki/Robotics "Robotics"),[^c1fn7] and playing [chess](https://en.wikipedia.org/wiki/Computer_chess "Computer chess").[^c1fn8] It has also led to the development of [pre-trained systems](https://en.wikipedia.org/wiki/Transfer_learning "Transfer learning"), such as [generative pre-trained transformers](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") (GPTs).[^c1fn9]

## History

### Predecessors

Before transformers, [recurrent neural networks](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network") (RNNs) were widely used for sequence modelling and generation. A well-cited early example was the [Elman network](https://en.wikipedia.org/wiki/Elman_network "Elman network") (1990). In theory, the information from one token can propagate arbitrarily far down the sequence, but in practice the [vanishing-gradient problem](https://en.wikipedia.org/wiki/Vanishing-gradient_problem "Vanishing-gradient problem") leaves the model's state at the end of a long sentence without precise, extractable information about preceding tokens.

A key breakthrough was [LSTM](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (originally described in a 1995 technical report and formally published in 1997),[^c1fn2][^c1fn10] an RNN that introduced gating mechanisms to mitigate the vanishing gradient problem, allowing efficient learning of long-sequence modelling. One key architectural element was the use of *multiplicative gating units*, in which the outputs of some neurons modulate the outputs of others. These multiplicative units are conceptually distinct from the additive attention mechanism later introduced for sequence-to-sequence models.
[^c1fn11] Neural networks using multiplicative units were later called *sigma-pi networks*[^c1fn12] or *[higher-order networks](https://en.wikipedia.org/wiki/Higher-order_neural_network?action=edit&redlink=1 "Higher-order neural network")*.[^c1fn13] LSTM became the standard architecture for long sequence modelling until the 2017 publication of transformers. However, LSTM still used sequential processing, like most other RNNs.[^c1fn14] Specifically, RNNs operate one token at a time from first to last; they cannot operate in parallel over all tokens in a sequence.

Transformers allow parallel processing of tokens during training, but standard self-attention has computational and memory costs that grow quadratically with sequence length.

### Attention with seq2seq

The idea of encoder–decoder sequence transduction had been developed in the early 2010s; commonly cited as the originators that produced seq2seq are two concurrently published papers from 2014.[^c1fn15][^c1fn16]

A 380M-parameter model for machine translation uses two [long short-term memories](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (LSTM).[^c1fn16] Its architecture consists of two parts. The *encoder* is an LSTM that takes in a sequence of tokens and turns it into a vector. The *decoder* is another LSTM that converts the vector into a sequence of tokens. Similarly, another 130M-parameter model used [gated recurrent units](https://en.wikipedia.org/wiki/Gated_recurrent_unit "Gated recurrent unit") (GRU) instead of LSTM.[^c1fn15] Later research showed that GRUs are neither better nor worse than LSTMs for seq2seq.[^c1fn17][^c1fn18]

These early seq2seq models had no attention mechanism, and the state vector is accessible only after the *last* word of the source text was processed. Although in theory such a vector retains the information about the whole original sentence, in practice the information is poorly preserved. This is because the input is processed sequentially by one recurrent network into a *fixed*-size output vector, which is then processed by another recurrent network into an output. If the input is long, then the output vector would not be able to contain all relevant information, degrading the output. As evidence, reversing the input sentence improved seq2seq translation.[^c1fn19]

The *RNN search* model introduced an attention mechanism to seq2seq for machine translation to solve the bottleneck problem (of the *fixed-size* output vector), allowing the model to process long-distance dependencies more easily. The name is because it "emulates searching through a source sentence during decoding a translation".[^c1fn3]

The relative performances were compared between global (that of *RNN search*) and local (sliding window) attention model architectures for machine translation, finding that mixed attention had higher quality than global attention, while local attention reduced translation time.[^c1fn20]

In 2016, [Google Translate](https://en.wikipedia.org/wiki/Google_Translate "Google Translate") was revamped to [Google Neural Machine Translation](https://en.wikipedia.org/wiki/Google_Neural_Machine_Translation "Google Neural Machine Translation"), which replaced the previous model based on [statistical machine translation](https://en.wikipedia.org/wiki/Statistical_machine_translation "Statistical machine translation"). The new model was a seq2seq model where the encoder and the decoder were both 8 layers of bidirectional LSTM.[^c1fn21] It took nine months to develop, and it outperformed the statistical approach, which took ten years to develop.[^c1fn22]

### Parallelizing attention

Seq2seq models with attention (including self-attention) still suffered from the same issue with recurrent networks, which is that they are hard to [parallelize](https://en.wikipedia.org/wiki/Parallel_computing "Parallel computing"), which prevented them from being accelerated on GPUs. In 2016, *decomposable attention* applied a self-attention mechanism to [feedforward networks](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network"), which are easy to parallelize, and achieved state-of-the-art ([SOTA](https://en.wikipedia.org/wiki/State_of_the_art "State of the art")) results in [textual entailment](https://en.wikipedia.org/wiki/Textual_entailment "Textual entailment") with an order of magnitude fewer parameters than LSTMs.[^c1fn23] One of its authors, Jakob Uszkoreit, suspected that attention *without* recurrence would be sufficient for language translation, thus the title "attention is *All* you need".[^c1fn24] That hypothesis was against conventional wisdom at the time, and even his father [Hans Uszkoreit](https://en.wikipedia.org/wiki/Hans_Uszkoreit "Hans Uszkoreit"), a well-known computational linguist, was skeptical.[^c1fn24] In the same year, self-attention (called *intra-attention or* *intra-sentence attention*) was proposed for LSTMs.[^c1fn25]

On 2017-06-12, the original (100M-parameter) encoder–decoder transformer model was published in the "[Attention is All you need](https://en.wikipedia.org/wiki/Attention_is_all_you_need "Attention is all you need")" paper. At the time, the focus of the research was on improving [seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq") for [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"), by removing its recurrence to process all tokens in parallel, but preserving its dot-product attention mechanism to keep its text processing performance.[^c1fn1] This led to the introduction of a multi-head attention model that was easier to parallelize due to the use of independent heads and the lack of recurrence. Its parallelizability was an important factor to its widespread use in large neural networks.[^c1fn26]

### AI boom era

In spring 2017, before the "Attention is All you need" preprint was published, one of the co-authors applied the "decoder-only" variation of the architecture to generate fictitious Wikipedia articles.[^c1fn27] Transformer architecture is now used alongside many [generative models](https://en.wikipedia.org/wiki/Generative_AI "Generative AI") that contribute to the ongoing [AI boom](https://en.wikipedia.org/wiki/AI_boom "AI boom").

The "reference implementation" of the original Transformer was written in a TensorFlow library.[^c1fn28][^c1fn29] In language modelling, [ELMo](https://en.wikipedia.org/wiki/ELMo "ELMo") (2018) was a bi-directional LSTM that produces contextualized [word embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding"), improving upon the line of research from [bag of words](https://en.wikipedia.org/wiki/Bag-of-words_model "Bag-of-words model") and [word2vec](https://en.wikipedia.org/wiki/Word2vec "Word2vec"). It was followed by [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") (2018), an encoder-only transformer model.[^c1fn30] In October 2019, Google started using BERT to process search queries.[^c1fn31] In 2020, Google Translate replaced the previous RNN-encoder–RNN-decoder model by a transformer-encoder–RNN-decoder model.[^c1fn32]

Starting in 2018, the OpenAI [GPT series](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") of decoder-only transformers became state of the art in [natural language generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation"). At the end of 2022, [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT"), a chatbot based on a fine-tuned variant of GPT-3.5, became unexpectedly[^c1fn33][^c1fn34] popular, triggering a boom around [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model").[^c1fn35]

Transformers have been applied in modalities beyond text. Four days after the publication of "Attention is All You Need", a [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning") transformer architecture, MultiModel, was published by most authors of that paper.[^c1fn36] Other examples include the [vision transformer](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer"), which has led to developments in [convolutional neural networks](https://en.wikipedia.org/wiki/Convolutional_neural_network "Convolutional neural network").[^c1fn37] Image and video generators like [DALL-E](https://en.wikipedia.org/wiki/DALL-E "DALL-E") (2021), [Stable Diffusion 3](https://en.wikipedia.org/wiki/Stable_Diffusion "Stable Diffusion") (2024), and [Sora](https://en.wikipedia.org/wiki/Sora_%28text-to-video_model%29 "Sora (text-to-video model)") (2024), use transformers to analyse input data (like text prompts) by breaking it down into "tokens" and then calculating the relevance between each token using self-attention, which helps the model simulate the context and relationships within the data.

## Training

### Methods for stabilizing training

The plain transformer architecture had difficulty in converging. In the original paper,[^c1fn1] the authors recommended using [learning rate](https://en.wikipedia.org/wiki/Learning_rate "Learning rate") warmup. That is, the learning rate should linearly scale up from 0 to maximal value for the first part of the training (usually recommended to be 2% of the total number of training steps), before decaying again.

A 2020 paper found that using [layer normalization](https://en.wikipedia.org/wiki/Layer_normalization "Layer normalization") *before* (instead of after) multihead attention and feedforward layers stabilizes training, not requiring learning rate warmup.[^c1fn38] This is the "pre-LN Transformer" and is more commonly used, compared to the original "post-LN Transformer".

### Regularization

The original transformer used dropout during training to reduce overfitting. Dropout was applied to the output of each sublayer before its residual connection and normalization, as well as to the sums of token embeddings and positional encodings. The original paper also used label smoothing, which replaces a certain target distribution with one that assigns a small amount of probability to alternative tokens. These techniques can improve generalization by going against overconfidence in the training targets.[^c1fn39]

### Distributed Training

Large transformer models are typically trained across multiple GPUs or other accelerators because their parameters, activations, and training data may not fit on a single device. Data parallelism copies the model across devices and splits different batches of training examples among them; gradients are then synchronized before parameters are updated. Model parallelism divides a model itself across devices. Tensor parallelism splits operations within individual layers, while pipeline parallelism assigns consecutive groups of layers to different devices.[^c1fn40]

### Pretrain-finetune

Transformers typically are first pretrained by [self-supervised learning](https://en.wikipedia.org/wiki/Self-supervised_learning "Self-supervised learning") on a large generic dataset, followed by [supervised](https://en.wikipedia.org/wiki/Supervised_learning "Supervised learning") [fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)") on a small task-specific dataset. The pretrain dataset is typically an unlabeled large corpus, such as [The Pile](https://en.wikipedia.org/wiki/The_Pile_%28dataset%29 "The Pile (dataset)"). Tasks for pretraining and fine-tuning commonly include:

- [reading comprehension](https://en.wikipedia.org/wiki/Natural-language_understanding "Natural-language understanding")
- [sentiment analysis](https://en.wikipedia.org/wiki/Sentiment_analysis "Sentiment analysis")[^c1fn1]
- [paraphrasing](https://en.wikipedia.org/wiki/Text_Summaries "Text Summaries")[^c1fn1]

The [T5 transformer](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") report[^c1fn41] documents a large number of [natural language](https://en.wikipedia.org/wiki/Natural_language "Natural language") pretraining tasks. Some examples are:

- restoring or repairing incomplete or corrupted text. For example, the input, *"Thank you ~~ me to your party ~~ week",* might generate the output, *"Thank you **for inviting** me to your party **last** week".*
- translation between natural languages ([machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"))
- judging the pragmatic acceptability of natural language. For example, the following sentence might be judged "not acceptable",[^c1fn42] because even though it is syntactically well-formed, it is improbable in ordinary human usage: *The course is jumping well.*

While each of these tasks is trivial or obvious for human native speakers of the language (or languages), they have typically proved challenging for previous generations of machine learning architecture.

### Knowledge distillation

Knowledge distillation is a method for training a smaller model, called a "student", to reproduce the output behavior of a larger "teacher" model. In transformer models, the student can be trained using the teacher's output probability distribution, intermediate representations, or attention patterns in addition to the original training labels. Distillation can lower computational and memory requirements of deployment while keeping most of the teacher model's performance on a specified task.

### Tasks

In general, there are three classes of language modelling tasks: "masked",[^c1fn43] "autoregressive",[^c1fn44] and "prefixLM".[^c1fn45] These classes are independent of a specific modeling architecture such as transformer, but they are often discussed in the context of transformer.

In a masked task,[^c1fn43] one or more of the tokens is masked out, and the model would produce a probability distribution predicting what the masked-out tokens are based on the context. The [loss function](https://en.wikipedia.org/wiki/Loss_function "Loss function") for the task is typically sum of [log-perplexities](https://en.wikipedia.org/wiki/Perplexity "Perplexity") for the masked-out tokens: $$\text{Loss} = -\sum_{t\in\text{masked tokens}}\ln(\text{probability of }t\text{ conditional on its context})$$and the model is trained to minimize this loss function. The [BERT series of models](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") are trained for masked token prediction and another task. ("Masked" as in "masked language modelling" is not "masked" as in "[masked attention](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Masked_attention)".)

In an autoregressive task,[^c1fn44] the entire sequence is masked at first, and the model produces a probability distribution for the first token. Then the first token is revealed and the model predicts the second token, and so on. The loss function for the task is still typically the same. The [GPT series of models](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") are trained by autoregressive tasks.

In a prefixLM task,[^c1fn45] the sequence is divided into two parts. The first part is presented as context, and the model predicts the first token of the second part. Then that would be revealed, and the model predicts the second token, and so on. The loss function for the task is still typically the same. The [T5 series of models](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") are trained by prefixLM tasks. ("PrefixLM" as in "prefix language modeling" is not "prefixLM" as in "[prefix language model](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#prefixLM)".)

## Architecture

All transformers have the same primary components:

- Tokenizers, which convert text into tokens.
- Embedding layer, which converts tokens and positions of the tokens into vector representations.
- Transformer layers, which carry out repeated transformations on the vector representations, extracting more and more linguistic information. These consist of alternating attention and feedforward layers. There are two major types of transformer layers: encoder layers and decoder layers, with further variants.
- Un-embedding layer, which converts the final vector representations back to a probability distribution over the tokens.

The following description follows exactly the transformer as described in the original paper. There are variants, described in the [following section](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Subsequent_work).

By convention, we write all vectors as row vectors. For example, pushing a vector through a linear layer means multiplying it by a weight matrix on the right, as $xW$.

### Tokenization

As the transformer architecture natively consists of operations over numbers (matrix multiplications, dot products, activation functions) rather than over text, there must first be a mapping from any input text to some numerical representation. A text is cleaned, segmented into subsections, then each subsection is mapped to an integer according to a lookup table (also called the *vocabulary* $V$). Subsections that do not appear in the vocabulary are usually represented by a special token `[UNK]` ("unknown").

The vocabulary $V$ itself needs to be constructed before tokenization. This construction step is called vocabularization. The vocabulary can either be learned on a given textual corpus, or downloaded without learning on any textual corpus.

Commonly used algorithms include [byte pair encoding](https://en.wikipedia.org/wiki/Byte_pair_encoding "Byte pair encoding") (BPE) and the unigram language model (ULM), each of which include a vocabularization algorithm and a tokenization algorithm. If a vocabulary is already known, then only tokenization needs to be done. An example tokenization algorithm is greedily recognising tokens left-to-right.

### Embedding

Each integer token identifier is converted into an embedding vector via a [lookup table](https://en.wikipedia.org/wiki/Lookup_table "Lookup table"). Equivalently stated, it multiplies a [one-hot](https://en.wikipedia.org/wiki/One-hot "One-hot") representation of the token identifier by an embedding matrix $M$. For example, if the input token's identifier is $3$, then the one-hot representation is $[0, 0, 0, 1, 0, 0, \dots]$, and its embedding vector is$$\mathrm{Embed}(3) = [0, 0, 0, 1, 0, 0, \dots]M$$The token embedding vectors are added to their respective positional encoding vectors (see below), producing the sequence of input vectors.

The dimension of an embedding vector is called *hidden size* or *embedding size* and written as $d_{\text{emb}}$.[^c1fn30] This size is written as $d_{\text{model}}$ in the original transformer paper.[^c1fn1]

### Un-embedding

An un-embedding layer is almost the reverse of an embedding layer. Whereas an embedding layer converts a token identifier into a vector, an un-embedding layer converts a vector into a probability distribution over tokens.

The un-embedding layer is a linear-[softmax](https://en.wikipedia.org/wiki/Softmax_function "Softmax function") layer:$$\mathrm{UnEmbed}(x) = \mathrm{softmax}(xW + b)$$The matrix has shape $(d_{\text{emb}}, |V|)$. Some architectures use the transpose of the embedding matrix $M$ as the un-embedding matrix $W$ in order to avoid needing double the amount of embedding-related parameters and to avoid divergence during training. This practice is called *weight tying*.

### Positional encoding

![Illustration of (absolute) positional encoding with parameters $N=10000, d=100$](https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Absolute_positional_encoding.png/250px-Absolute_positional_encoding.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

A positional encoding is a fixed-size vector representation of the relative positions of tokens within a sequence: it provides the transformer model with information about *where* the words are in the input sequence. This induces a [bias](https://en.wikipedia.org/wiki/Inductive_bias "Inductive bias") towards the order of the input sequence, so that, for example, the input sequence "[man bites dog](https://en.wikipedia.org/wiki/Man_bites_dog "Man bites dog")" is processed differently from "dog bites man".

The positional encoding is defined as a function of type $f: \R \to \R^d$, where $d$ is a positive even [integer](https://en.wikipedia.org/wiki/Integer "Integer"). The full positional encoding defined in the original paper is:$$(f(t)_{2k}, f(t)_{2k+1}) = (\sin(\theta), \cos(\theta)) \quad \forall k \in \{0, 1, \ldots, d/2 - 1\}$$where $\theta = \frac{t}{r^k}, r = N^{2/d}$.[^c1fn1]

Here, $N$ is a free parameter that should be significantly larger than the biggest $k$ that would be input into the positional encoding function. The original paper uses $N=10000$.

The function is in a simpler form when written as a complex function of type $f: \R \to \mathbb C^{d/2}$$$f(t) = \left(e^{it/r^k}\right)_{k=0, 1, \ldots, \frac d 2 - 1}$$where $r = N^{2/d}$.

The main reason for using this positional encoding function is that using it, shifts are linear transformations:$$f(t + \Delta t) = \mathrm{diag}(f(\Delta t)) f(t)$$where $\Delta t \in \R$ is the distance one wishes to shift. This allows the transformer to take any encoded position, and find the encoding of the position n-steps-ahead or n-steps-behind, by a matrix multiplication.

By taking a linear sum, any convolution can also be implemented as linear transformations:$$\sum_j c_j f(t + \Delta t_j) = \left(\sum_j c_j \,\mathrm{diag}(f(\Delta t_j))\right) f(t)$$for any constants $c_j$. This allows the transformer to take any encoded position and find a linear sum of the encoded locations of its neighbors. This sum of encoded positions, when fed into the attention mechanism, would create attention weights on its neighbors, much like what happens in a [convolutional neural network](https://en.wikipedia.org/wiki/Convolutional_neural_network "Convolutional neural network") [language model](https://en.wikipedia.org/wiki/Language_model "Language model"). In the author's words, "we hypothesized it would allow the model to easily learn to attend by relative position."

In typical implementations, all operations are done over the real numbers, not the complex numbers, but since [complex multiplication can be implemented as real 2-by-2 matrix multiplication](https://en.wikipedia.org/wiki/Complex_number#Matrix_representation_of_complex_numbers "Complex number"), this is a mere notational difference.

### Encoder–decoder (overview)

![One encoder–decoder block](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Transformer%2C_one_encoder-decoder_block.png/250px-Transformer%2C_one_encoder-decoder_block.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![A transformer is composed of stacked encoder layers and decoder layers.](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Transformer%2C_stacked_layers_and_sublayers.png/250px-Transformer%2C_stacked_layers_and_sublayers.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Like earlier [seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq") models, the original transformer model used an **encoder–decoder** architecture. The encoder consists of encoding layers that process all the input tokens together one layer after another, while the decoder consists of decoding layers that iteratively process the encoder's output and the decoder's output tokens so far.

The purpose of each encoder layer is to create contextualized representations of the tokens, where each representation corresponds to a token that "mixes" information from other input tokens via self-attention mechanism. Each decoder layer contains two attention sublayers: (1) cross-attention for incorporating the output of encoder (contextualized input token representations), and (2) self-attention for "mixing" information among the input tokens to the decoder (i.e. the tokens generated so far during inference time).

Both the encoder and decoder layers have a [feed-forward neural network](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network") for additional processing of their outputs and contain residual connections and layer normalization steps. These feed-forward layers contain most of the parameters in a transformer model.

### Feedforward network

![The feedforward network module. It is a two-layered network that maps $d_{\text{emb}}$-dimensional vectors into $d_{\text{emb}}$-dimensional vectors.](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/Transformer_architecture_-_FFN_module.png/250px-Transformer_architecture_-_FFN_module.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

The feedforward network (FFN) modules in a transformer are 2-layered [multilayer perceptrons](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network"):$$\mathrm{FFN}(x) = \phi(xW^{(1)} + b^{(1)})W^{(2)} + b^{(2)}$$where $W^{(1)}$ and $W^{(2)}$ are weight matrices and $b^{(1)}$ and $b^{(2)}$ are bias vectors, and $\phi$ is its activation function. The original transformer used [ReLU](https://en.wikipedia.org/wiki/Rectifier_%28neural_networks%29 "Rectifier (neural networks)") activation.

The number of neurons in the middle layer is called *intermediate size* (GPT),[^c1fn46] *filter size* (BERT),[^c1fn30] or *feedforward size* (BERT).[^c1fn30] It is typically larger than the embedding size. For example, in both GPT-2 series and BERT series, the intermediate size of a model is 4 times its embedding size: $d_{\text{ffn}} = 4 d_{\text{emb}}$.

### Scaled dot-product attention

#### Attention head

![Scaled dot-product attention, block diagram](https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Transformer%2C_attention_block_diagram.png/250px-Transformer%2C_attention_block_diagram.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Exact dimension counts within an attention head module](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Transformer_architecture_-_Attention_Head_module.png/250px-Transformer_architecture_-_Attention_Head_module.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

The attention mechanism used in the transformer architecture are scaled [dot-product](https://en.wikipedia.org/wiki/Dot_product "Dot product") [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") units. For each unit, the transformer model learns three weight matrices: the query weights $W^Q$, the key weights $W^K$, and the value weights $W^V$.

The module takes three sequences, a query sequence, a key sequence, and a value sequence. The query sequence is a sequence of length $\ell_{\text{seq, query}}$, and each entry is a vector of dimension $d_{\text{emb, query}}$. Similarly for the key and value sequences.

For each vector $x_{i, \text{query}}$ in the query sequence, it is multiplied by a matrix $W^Q$ to produce a query vector $q_i = x_{i, \text{query}} W^Q$. The matrix of all query vectors is the query matrix:$$Q = X_{\text{query}} W^Q$$Similarly, we construct the key matrix $K = X_{\text{key}} W^K$ and the value matrix $V = X_{\text{value}} W^V$.

It is usually the case that all $W^Q, W^K, W^V$ are square matrices, meaning $d_{\text{emb, query}}= d_{\text{query}}$, etc.

Attention weights are calculated using the query and key vectors: the attention weight $a_{ij}$ from token $i$ to token $j$ is the [dot product](https://en.wikipedia.org/wiki/Dot_product "Dot product") between $q_i$ and $k_j$. The attention weights are divided by the square root of the dimension of the key vectors, $\sqrt{d_k}$, which stabilizes gradients during training, and passed through a [softmax](https://en.wikipedia.org/wiki/Softmax_function "Softmax function") which normalizes the weights. The fact that $W^Q$ and $W^K$ are different matrices allows attention to be non-symmetric: if token $i$ attends to token $j$ (i.e. $q_i\cdot k_j$ is large), this does not necessarily mean that token $j$ will attend to token $i$ (i.e. $q_j\cdot k_i$ could be small). The output of the attention unit for token $i$ is the weighted sum of the value vectors of all tokens, weighted by $a_{ij}$, the attention from token $i$ to each token.

The attention calculation for all tokens can be expressed as one large matrix calculation using the [softmax function](https://en.wikipedia.org/wiki/Softmax_function "Softmax function"), which is useful for training due to computational matrix operation optimizations that quickly compute matrix operations. The matrices $Q$, $K$ and $V$ are defined as the matrices where the $i$th rows are vectors $q_i$, $k_i$, and $v_i$ respectively. Then we can represent the attention as$$\begin{align}
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^\mathrm{T}}{\sqrt{d_k}}\right)V
\end{align}$$

where the softmax is applied over each of the rows of the matrix.

The number of dimensions in a query vector is *query size* $d_{\text{query}}$ and similarly for the *key size* $d_{\text{key}}$ and *value size* $d_{\text{value}}$. The output dimension of an attention head is its *head dimension* $d_{\text{head}}$. The attention mechanism requires the following three equalities to hold:$$\ell_{\text {seq, key}}=\ell_{\text {seq, value}}, \;d_{\text {query}}=d_{\text {key}}, \; d_{\text {value}}=d_{\text {head}}$$but is otherwise unconstrained.

If the attention head is used in a self-attention fashion, then $X_{\text{query}} = X_{\text{key}} = X_{\text{value}}$. If the attention head is used in a cross-attention fashion, then usually $X_{\text{query}} \neq X_{\text{key}} = X_{\text{value}}$. It is theoretically possible for all three to be different, but that is rarely the case in practice.

#### Multihead attention

![Multihead attention, block diagram](https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Multiheaded_attention%2C_block_diagram.png/250px-Multiheaded_attention%2C_block_diagram.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Exact dimension counts within a multihead attention module](https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Transformer_architecture_-_Multiheaded_Attention_module.png/250px-Transformer_architecture_-_Multiheaded_Attention_module.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

One set of $\left( W^Q, W^K, W^V \right)$ matrices is called an *attention head*, and each layer in a transformer model has multiple attention heads. While each attention head attends to the tokens that are relevant to each token, multiple attention heads allow the model to do this for different definitions of "relevance". Specifically, the query and key projection matrices, $W^Q$ and $W^K$, which are involved in the attention score computation, defines the "relevance". Meanwhile, the value [projection matrix](https://en.wikipedia.org/wiki/Projection_matrix "Projection matrix") $W^V$, in combination with the part of the output projection matrix $W^O$, determines how the attended tokens influence what information is passed to subsequent layers and ultimately the output logits. In addition, the scope of attention, or the range of token relationships captured by each attention head, can expand as tokens pass through successive layers. This allows the model to capture more complex and long-range dependencies in deeper layers. Many transformer attention heads encode relevance relations that are meaningful to humans. For example, some attention heads can attend mostly to the next word, while others mainly attend from verbs to their direct objects.[^c1fn47] The computations for each attention head can be performed in [parallel](https://en.wikipedia.org/wiki/Parallel_computing "Parallel computing"), which allows for fast processing. The outputs for the attention layer are concatenated to pass into the [feedforward neural network](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network") layers.

Concretely, let the multiple attention heads be indexed by $i$, then we have$$\operatorname{MultiheadAttention}(Q, K, V) = \operatorname{Concat}_{i \in [n_{\text{heads}}]}(\operatorname{Attention}(XW^{Q, i}, XW^{K, i}, XW^{V, i})) W^O$$ where the matrix $X$ is the concatenation of word embeddings, and the matrices $W^{Q, i}, W^{K, i}, W^{V, i}$ are "projection matrices" owned by individual attention head $i$, and $W^O$ is a final projection matrix owned by the whole multihead attention module.

It is theoretically possible for each attention head to have a different head dimension $d_{\text{head}}$, but that is rarely the case in practice.

As an example, in the smallest GPT-2 model, there are only self-attention mechanisms. It has the following dimensions:$$d_{\text{emb}} = 768, n_{\text{head}} = 12, d_{\text{head}} = 64$$Since $12 \times 64 = 768$, its output projection matrix $W^O \in \R^{(12 \times 64) \times 768}$ is a square matrix.

#### Masked attention

The transformer architecture is constructed to calculate output tokens iteratively. Assuming $t = 0$ refers to the calculation of the first output token $i = 0$, for step $t > 0$, the output token $i = 0$ shall remain constant. This ensures properties of the model similar to [autoregressive models](https://en.wikipedia.org/wiki/Autoregressive_models "Autoregressive models").[^c1fn1] Therefore, at every time step $t$, the calculation for all outputs $i$ should not have access to tokens at position $j$ for $j >= i$ (as it naturally is the case for time step $t=i$, when tokens $j>t$ are not yet calculated). This behavior may be accomplished before the softmax stage by adding a mask matrix $M$ that is $-\infty$ at entries where the attention link must be cut, and $0$ at other places:$$\begin{align}
\text{MaskedAttention}(Q, K, V) = \text{softmax}\left(\frac{QK^\mathrm{T}}{\sqrt{d_k}} + M\right)V
\end{align}$$ The following matrix is commonly used in decoder self-attention modules, called "causal masking":$$M_{\text{causal}} = \begin{bmatrix}
0 & -\infty & -\infty & \dots  & -\infty \\
0 & 0 & -\infty & \dots  & -\infty \\
0 & 0 & 0 & \dots  & -\infty \\
\vdots & \vdots & \vdots & \ddots & \vdots \\
0 & 0 & 0 & \dots  & 0
\end{bmatrix}$$

In words, it means that each token can pay attention to itself, and every token before it, but not any after it. A non-masked attention module can be thought of as a masked attention module where the mask has all entries zero. As an example of an uncommon use of mask matrix, the [XLNet](https://en.wikipedia.org/wiki/XLNet "XLNet") considers all masks of the form $P M_{\text{causal}} P^{-1}$, where $P$ is a random [permutation matrix](https://en.wikipedia.org/wiki/Permutation_matrix "Permutation matrix").[^c1fn48]

### Encoder

![One encoder layer](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/Transformer%2C_one_encoder_block.png/250px-Transformer%2C_one_encoder_block.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

An encoder consists of an embedding layer, followed by multiple encoder layers.

Each encoder layer consists of two major components: a self-attention mechanism and a feed-forward layer. It takes an input as a sequence of input vectors, applies the self-attention mechanism, to produce an intermediate sequence of vectors, then applies the feed-forward layer for each vector individually. Schematically, we have:$\begin{aligned}
\text{given input vectors } & h_0, h_1, \dots\\
\text{combine them into a matrix } H &= \begin{bmatrix} h_0 \\ h_1 \\ \vdots \end{bmatrix} \\
\text{EncoderLayer}(H) &= \begin{bmatrix} \text{FFN}(\text{MultiheadAttention}(H, H, H)_0) \\ \text{FFN}(\text{MultiheadAttention}(H, H, H)_1) \\ \vdots \end{bmatrix} \\
\end{aligned}$

where $\text{FFN}$ stands for "feed-forward network". We can more succinctly write it as$$\text{EncoderLayer}(H) = \text{FFN}(\text{MultiheadAttention}(H, H, H))$$with the implicit convention that the $\text{FFN}$ is applied to each row of the matrix individually.

The encoder layers are stacked. The first encoder layer takes the sequence of input vectors from the embedding layer, producing a sequence of vectors. This sequence of vectors is processed by the second encoder, and so on. The output from the final encoder layer is then used by the decoder.

As the encoder processes the entire input all at once, every token can attend to every other token (all-to-all attention), so there is no need for causal masking.

### Decoder

![One decoder layer](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Transformer%2C_one_decoder_block.png/250px-Transformer%2C_one_decoder_block.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

A decoder consists of an embedding layer, followed by multiple decoder layers, followed by an un-embedding layer.

Each decoder consists of three major components: a causally masked self-attention mechanism, a cross-attention mechanism, and a feed-forward neural network. The decoder functions in a similar fashion to the encoder, but an additional attention mechanism is inserted which instead draws relevant information from the encodings generated by the encoders. This mechanism can also be called the *encoder–decoder attention*.[^c1fn1]
Like the first encoder, the first decoder takes positional information and embeddings of the output sequence as its input, rather than encodings. The transformer must not use the current or future output to predict an output, so the output sequence must be partially masked to prevent this reverse information flow.[^c1fn1] This allows for [autoregressive](https://en.wikipedia.org/wiki/Autoregressive_model "Autoregressive model") text generation. For decoding, all-to-all attention is inappropriate, because a token cannot attend to tokens not yet generated. Thus, the self-attention module in the decoder is causally masked.

In contrast, the cross-attention mechanism attends to the output vectors of the encoder, which is computed before the decoder starts decoding. Consequently, there is no need for masking in the cross-attention mechanism.

Schematically, we have:$$\begin{aligned}
H' &= \text{MaskedMultiheadAttention}(H, H, H) \\
\text{DecoderLayer}(H) &=\text{FFN}(\text{MultiheadAttention}(H', H^E, H^E))
\end{aligned}$$where $H^E$ is the matrix with rows being the output vectors from the encoder.

The last decoder is followed by a final un-embedding layer to produce the output probabilities over the vocabulary. Then, one of the tokens is sampled according to the probability, and the decoder can be run again to produce the next token, etc., autoregressively generating output text.

## Full transformer architecture

### Sublayers

![(a) One encoder layer and one decoder layer. (b) Two encoder layers and two decoder layers. The sublayers are labelled as well.](https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7a/Transformer%2C_stacked_multilayers.png/250px-Transformer%2C_stacked_multilayers.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Each encoder layer contains 2 sublayers: the self-attention and the feedforward network. Each decoder layer contains 3 sublayers: the causally masked self-attention, the cross-attention, and the feedforward network.

![Transformer encoder with norm-first and norm-last](https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Transformer_encoder%2C_with_norm-first_and_norm-last.png/250px-Transformer_encoder%2C_with_norm-first_and_norm-last.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Transformer decoder with norm-first and norm-last](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/Transformer_decoder%2C_with_norm-first_and_norm-last.png/250px-Transformer_decoder%2C_with_norm-first_and_norm-last.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Block diagram for the full transformer architecture](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/Transformer%2C_full_architecture.png/250px-Transformer%2C_full_architecture.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

![Schematic [object hierarchy](https://en.wikipedia.org/wiki/Object_hierarchy "Object hierarchy") for the full transformer architecture, in [object-oriented programming](https://en.wikipedia.org/wiki/Object-oriented_programming "Object-oriented programming") style](https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Transformer%2C_schematic_object_hierarchy%2C_for_implementation_in_object-oriented_programming.png/250px-Transformer%2C_schematic_object_hierarchy%2C_for_implementation_in_object-oriented_programming.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

The final points of detail are the [residual connections](https://en.wikipedia.org/wiki/Residual_neural_network "Residual neural network") and [layer normalization](https://en.wikipedia.org/wiki/Layer_normalization "Layer normalization"), (denoted as "LayerNorm", or "LN" in the following), which while conceptually unnecessary, are necessary for numerical stability and convergence.

The residual connections are introduced to avoid vanishing gradient issues and stabilize the training process. They can be expressed by $x \mapsto F(x) + x$, where $F$ is a given component of the transformer. Adding the input $x$ can preserve the input information and avoid issues when the gradient of $F(x)$ is close to zero.

Similarly to how the feedforward network modules are applied individually to each vector, the LayerNorm is also applied individually to each vector.

There are two common conventions in use: the *post-LN* and the *pre-LN* convention. In the post-LN convention, the output of each sublayer is $$\mathrm{LayerNorm}(x + \mathrm{Sublayer}(x))$$where $\mathrm{Sublayer}(x)$ is the function implemented by the sublayer itself.

In the pre-LN convention, the output of each sublayer is$$x + \mathrm{Sublayer}(\mathrm{LayerNorm}(x))$$The original 2017 transformer used the post-LN convention. It was difficult to train and required careful hyperparameter tuning and a "warm-up" in learning rate, where it starts small and gradually increases. The pre-LN convention, proposed several times in 2018,[^c1fn49] was found to be easier to train, requiring no warm-up, leading to faster convergence.[^c1fn38]

### Pseudocode

The following is the pseudocode for a standard pre-LN encoder–decoder transformer, adapted from *Formal Algorithms for Transformers*.[^c1fn50]

```
input: Encoder input t_e
       Decoder input t_d
output: Array of probability distributions, with shape (decoder vocabulary size x length(decoder output sequence))

/* encoder */
z_e ← encoder.tokenizer(t_e)

for each t in 1:length(z_e) do
    z_e[t] ← encoder.embedding(z_e[t]) + encoder.positional_embedding(t)

for each l in 1:length(encoder.layers) do
    layer ← encoder.layers[l]

    /* first sublayer */
    z_e_copy ← copy(z_e)
    for each t in 1:length(z_e) do
        z_e[t] ← layer.layer_norm(z_e[t])
    z_e ← layer.multihead_attention(z_e, z_e, z_e)
    for each t in 1:length(z_e) do
        z_e[t] ← z_e[t] + z_e_copy[t]

    /* second sublayer */
    z_e_copy ← copy(z_e)
    for each t in 1:length(z_e) do
        z_e[t] ← layer.layer_norm(z_e[t])
    z_e ← layer.feedforward(z_e)
    for each t in 1:length(z_e) do
        z_e[t] ← z_e[t] + z_e_copy[t]

for each t in 1:length(z_e) do
    z_e[t] ← encoder.final_layer_norm(z_e[t])

/* decoder */
z_d ← decoder.tokenizer(t_d)

for each t in 1:length(z_d) do
    z_d[t] ← decoder.embedding(z_d[t]) + decoder.positional_embedding(t)

for each l in 1:length(decoder.layers) do
        layer ← decoder.layers[l]

        /* first sublayer */
        z_d_copy ← copy(z_d)
        for each t in 1:length(z_d) do
            z_d[t] ← layer.layer_norm(z_d[t])
        z_d ← layer.masked_multihead_attention(z_d, z_d, z_d)
        for each t in 1:length(z_d) do
            z_d[t] ← z_d[t] + z_d_copy[t]

        /* second sublayer */
        z_d_copy ← copy(z_d)
        for each t in 1:length(z_d) do
            z_d[t] ← layer.layer_norm(z_d[t])
        z_d ← layer.multihead_attention(z_d, z_e, z_e) 
       for each t in 1:length(z_d) do
           z_d[t] ← z_d[t] + z_d_copy[t]

        /* third sublayer */
        z_d_copy ← copy(z_d)
        for each t in 1:length(z_d) do
            z_d[t] ← layer.layer_norm(z_d[t])
        z_d ← layer.feedforward(z_d)
        for each t in 1:length(z_d) do
            z_d[t] ← z_d[t] + z_d_copy[t]

z_d ← decoder.final_layer_norm(z_d)

output_distributions ← []
for each t in 1:length(z_d) do
    output_distributions.append(decoder.unembed(z_d[t]))

return output_distributions
```

### Terminology

The transformer architecture, being modular, allows variations. Several common variations are described here.[^c1fn41]

An "encoder-only" transformer applies the encoder to map an input text into a sequence of vectors that represent the input text. This is usually used for text embedding and [representation learning](https://en.wikipedia.org/wiki/Feature_learning "Feature learning") for downstream applications. [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") is encoder-only. They are less often used currently, as they were found to be not significantly better than training an encoder–decoder transformer, then taking just the encoder.[^c1fn45] They are also referred to as "all-to-all" or "BERT-like".

A "decoder-only" transformer is not literally decoder-only, since without an encoder, the cross-attention mechanism has nothing to attend to. Thus, the decoder layers in a decoder-only transformer are composed of just two sublayers: the causally masked self-attention, and the feedforward network. This is usually used for [text generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation") and [instruction following](https://en.wikipedia.org/wiki/Large_language_model#Instruction_tuning "Large language model"). The models in the [GPT series](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") and [Chinchilla series](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)") are decoder-only. They are also referred to as "autoregressive" or "causal".

An "encoder–decoder" transformer is generally the same as the original transformer, with 2 sublayers per encoder layer and 3 sublayers per decoder layer, etc. They might have minor architectural improvements, such as [alternative activation functions](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_activation_functions), [changing the location of normalization](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#pre-LN), etc. This is also usually used for text generation and instruction following. The models in the [T5 series](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") are encoder–decoder.[^c1fn41]

A "prefixLM" (prefix language model) is a decoder-only architecture, but with prefix masking, which is different from causal masking. Specifically, it has mask of the form[^c1fn41]<sup>: Figure 3</sup>[^c1fn51]$$M_{\text{prefixLM}} = \begin{bmatrix}
\mathbf{0} &  -\infty \\
\mathbf{0} & M_{\text{causal}} 
\end{bmatrix}$$where the first columns correspond to the "prefix", and the subsequent columns correspond to the autoregressively generated text based on the prefix. They resemble encoder–decoder models, but has less "sparsity". Such models are rarely used, though they are cited as theoretical possibilities and benchmarked comparisons.[^c1fn45]

There are also mixed seq2seq models. For example, in 2020, Google Translate replaced the previous RNN-encoder–RNN-decoder model with a transformer-encoder–RNN-decoder model, as transformer-based decoders did not appear to significantly increase quality unlike the encoder, while the RNN decoder was much faster.[^c1fn32]

## Subsequent work

Many improvements have been added to the Transformer architecture. A standard improved configuration is Transformer++, which uses [RoPE](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#RoPE), [RMSNorm](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_normalizations), and [SwiGLU](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_activation_functions) feedforward module.[^c1fn52]

### Alternative feedforward module

The original transformer's feedforward module is a standard linear-[ReLU](https://en.wikipedia.org/wiki/ReLU "ReLU")-linear network. Other feedforward modules were developed. The [Llama series](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)") and [PaLM](https://en.wikipedia.org/wiki/PaLM "PaLM") used SwiGLU;[^c1fn53] both GPT-1 and BERT[^c1fn30] used GELU.[^c1fn54]

Alternative activation functions are often used in combination with [Gated Linear Units](https://en.wikipedia.org/wiki/Gated_Linear_Unit "Gated Linear Unit") in the feedforward module.[^c1fn53]

### Alternative normalizations

The normalization used in the transformer can be different from LayerNorm. One example is [RMSNorm](https://en.wikipedia.org/wiki/RMSNorm "RMSNorm")[^c1fn55] which is used in the [Llama series](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)"). Other examples include ScaleNorm[^c1fn56] and FixNorm.[^c1fn56]

### Alternative positional encodings

Transformers may use other positional encoding methods than sinusoidal.[^c1fn57]

The original transformer paper reported using a learned positional encoding,[^c1fn58] but finding it not superior to the sinusoidal one.[^c1fn1] Later,[^c1fn59] found that causal masking itself provides enough signal to a transformer decoder that it can learn to implicitly perform absolute positional encoding without the positional encoding module.

### Efficient implementation

The transformer model has been implemented in standard deep learning [frameworks](https://en.wikipedia.org/wiki/Framework_%28computer_science%29 "Framework (computer science)") such as [TensorFlow](https://en.wikipedia.org/wiki/TensorFlow "TensorFlow") and [PyTorch](https://en.wikipedia.org/wiki/PyTorch "PyTorch"). *Transformers* is a library produced by [Hugging Face](https://en.wikipedia.org/wiki/Hugging_Face "Hugging Face") that supplies transformer-based architectures and pretrained models.[^c1fn9]

#### KV caching

When an autoregressive transformer is used for inference, such as generating text, the query vector is different at each step, but the already-computed key and value vectors are always the same. The **KV caching** method saves the computed key and value vectors at each attention block, so that they are not recomputed at each new token. [PagedAttention](https://en.wikipedia.org/wiki/PagedAttention "PagedAttention") applies [memory paging](https://en.wikipedia.org/wiki/Memory_paging "Memory paging") to KV caching.[^c1fn60][^c1fn61][^c1fn62]

If a transformer is used with a baked-in prompt, such as ["You are a customer support agent..."], then the key and value vectors can be computed for the prompt, and saved on disk. The saving in compute is significant when the model is used for many short real-time interactions, such as in online chatbots.

In general, when a user uses an autoregressive transformer to generate a continuation to a sequence of tokens, the model would first perform a forward-pass on this sequence, whereby the KV caches over this sequence are computed. This is called **prefilling**. After prefilling, the actual token generation is called **decoding**. [Hyperscalers](https://en.wikipedia.org/wiki/Hyperscale_computing "Hyperscale computing") serving large Transformer models may use **disaggregated inference**, wherein prefilling and decoding are performed on separately specialized hardware.[^c1fn63]

#### Continuous Batching

When using autoregressive transformer models, requests can have different input lengths and can finish generating at different times. Continuous batching adds new requests to batch and removes completed requests between decoding iterations instead of waiting for every request in a batch to finish. This improves hardware utilization and can reduce latency and increase throughput for systems that serve many concurrent requests.[^c1fn64]

#### Quantization

Transformer models are often quantized for inference, meaning that weights, activations, or both are represented with lower-precision numerical formats than the floating point formats used during training. Quantization can reduce memory use and data transfer costs and can improve inference speed on hardware that supports low precision arithmetic. The trade off is that aggressive quantization can come at the cost of model accuracy or may need calibration and specialized quantization methods to perform well.[^c1fn65]

#### FlashAttention

FlashAttention[^c1fn66] is an algorithm that implements the transformer attention mechanism efficiently on a [GPU](https://en.wikipedia.org/wiki/Graphics_processing_unit "Graphics processing unit"). It is a communication-avoiding algorithm that performs [matrix multiplications in blocks](https://en.wikipedia.org/wiki/Block_matrix#Block_matrix_operations "Block matrix"), such that each block fits within the [cache](https://en.wikipedia.org/wiki/Cache_%28computing%29 "Cache (computing)") of a GPU, and by careful management of the blocks it minimizes data copying between GPU caches (as data movement is slow).

The [FlashAttention](https://en.wikipedia.org/wiki/FlashAttention "FlashAttention") method is a [communication-avoiding algorithm](https://en.wikipedia.org/wiki/Communication-avoiding_algorithm "Communication-avoiding algorithm") that fuses these operations into a single loop, increasing the [arithmetic intensity](https://en.wikipedia.org/wiki/Arithmetic_intensity "Arithmetic intensity"). It is an [online algorithm](https://en.wikipedia.org/wiki/Online_algorithm "Online algorithm") that computes the following quantities:[^c1fn67][^c1fn66]$$\begin{aligned}
z_i &= q^T k_i &\\
m_i &= \max(z_1, \dots, z_i) &={}& \max(m_{i-1}, z_i)\\
\ell_i &= e^{z_1 - m_i} + \dots + e^{z_i - m_i} &={}& e^{m_{i-1}-m_i} \ell_{i-1}  + e^{z_i - m_i}\\
o_i &= e^{z_1 - m_i} v_1 + \dots + e^{z_i - m_i}v_i &={}& e^{m_{i-1}-m_i} o_{i-1} + e^{z_i - m_i}v_i
\end{aligned}$$and returns $o_N/\ell_N$. In practice, FlashAttention operates over multiple queries and keys per loop iteration, in a similar way as [blocked matrix multiplication](https://en.wikipedia.org/wiki/Communication-avoiding_algorithm#Blocked_%28tiled%29_matrix_multiplication "Communication-avoiding algorithm"). If [backpropagation](https://en.wikipedia.org/wiki/Backpropagation "Backpropagation") is needed, then the output vectors and the intermediate arrays $[m_1, \dots, m_N], [\ell_1, \dots, \ell_N]$ are cached, and during the backward pass, attention matrices are [rematerialized](https://en.wikipedia.org/wiki/Rematerialization "Rematerialization") from these, making it a form of gradient checkpointing.

An improved version, FlashAttention-2, was developed to handle longer context lengths.[^c1fn68]

#### Multi-Query Attention

![Comparison between several different forms of attention mechanism and the amount of KV caching necessary for each](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/DeepSeek_KV_cache_comparison_between_MHA%2C_GQA%2C_MQA%2C_MLA.svg/250px-DeepSeek_KV_cache_comparison_between_MHA%2C_GQA%2C_MQA%2C_MLA.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Multi-Query Attention (MQA) changes the Multihead Attention mechanism.[^c1fn69] Whereas normally,

$$\text{MultiheadAttention}(Q, K, V) = \text{Concat}_{i \in [n_{\text{heads}}]}\left(\text{Attention}(XW^Q_i, XW^K_i, XW^V_i)\right) W^O$$with Multi-Query Attention, there is just one $W^K, W^V$, thus:

$$\text{MultiQueryAttention}(Q, K, V) = \text{Concat}_{i \in [n_{\text{heads}}]}\left(\text{Attention}(XW^Q_i, XW^K, XW^V)\right) W^O$$

This has a neutral effect on model quality and training speed, but increases inference speed.

More generally, grouped-query attention (GQA) partitions attention heads into groups, each of which shares the key-value pair. MQA is GQA with one group, while standard Multihead Attention is GQA with the maximal number of groups.[^c1fn70]

![The architecture of V2, showing both MLA and a variant of [mixture of experts](https://en.wikipedia.org/wiki/Mixture_of_experts "Mixture of experts")[^c1fn71]<sup>: Figure 2</sup>](https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/DeepSeek_MoE_and_MLA_%28DeepSeek-V2%29.svg/250px-DeepSeek_MoE_and_MLA_%28DeepSeek-V2%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Multihead Latent Attention (MLA) is a [low-rank approximation](https://en.wikipedia.org/wiki/Low-rank_approximation "Low-rank approximation") to MQA. Specifically, each hidden vector, before entering the attention mechanism, is first projected to two low-dimensional spaces ("latent space"), one for query and one for key-value (KV vector). This design minimizes the KV cache, as only the low-dimensional KV vector needs to be cached.[^c1fn71]

#### Speculative decoding

Speculative decoding[^c1fn72][^c1fn73] is a method to accelerate token decoding. Similarly to [speculative execution](https://en.wikipedia.org/wiki/Speculative_execution "Speculative execution") in CPUs, future tokens are computed quickly, then verified. If the quickly computed tokens are incorrect, they are discarded and computed slowly.

The key factor in speculative decoding is that a transformer decoder can verify faster than it can decode, in the following sense.

Suppose we have two transformer models like GPT-3 and GPT-3-small, both with a context window size of 512. To generate an entire context window autoregressively with greedy decoding with GPT-3, it must be run for 512 times, each time generating a token $x_1, x_2, ..., x_{512}$, taking time $512 T_{\text{GPT-3}}$. However, if we had some educated guess for the values of these tokens, we could verify all of them in parallel, in one run of the model, by checking that each $x_t$ is indeed the token with the largest log-likelihood in the $t$-th output.

In speculative decoding, a smaller model or some other simple heuristic is used to generate a few speculative tokens that are subsequently verified by the larger model. For example, suppose we use GPT-3-small to generate four speculative tokens: $\tilde{x}_1, \tilde{x}_2, \tilde{x}_3, \tilde{x}_4$. This only takes $4 T_{\text{GPT-3-small}}$. These tokens are then run through the larger GPT-3 in one go. Suppose that $\tilde{x}_1$ and $\tilde{x}_2$ are verified by GPT-3 as what it would have picked, then those are kept, but $\tilde{x}_3$ is not, so $\tilde{x}_3, \tilde{x}_4$ are discarded, and GPT-3 is run on those. This would take $4 T_{\text{GPT-3-small}} + 3 T_{\text{GPT-3}}$, which might be shorter than $4 T_{\text{GPT-3}}$.

For non-greedy decoding, similar ideas apply, except the speculative tokens are accepted or rejected stochastically, in a way that guarantees the final output distribution is the same as if speculative decoding was not used.[^c1fn72][^c1fn74]

![Multi-token prediction](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Multi-Token_Prediction_%28DeepSeek%29_01.svg/250px-Multi-Token_Prediction_%28DeepSeek%29_01.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In Multi-Token Prediction, a single forward pass creates a final embedding vector, which then is un-embedded into a token probability. However, that vector can then be further processed by another transformer block to predict the *next* token, and so on for arbitrarily many steps into the future. This trades off accuracy for speed, since each new token costs just one more transformer block, rather than the entire stack.[^c1fn75][^c1fn76]

### Sub-quadratic transformers

Training transformer-based architectures can be expensive, especially for long inputs.[^c1fn77] Many methods have been developed to attempt to address the issue. In the image domain, Swin transformer is an efficient architecture that performs attention inside shifting windows.[^c1fn78] In the audio domain, SepTr decouples the attention in time and frequency domains.[^c1fn79] *Long Range Arena* (2020)[^c1fn80] is a standard benchmark for comparing the behavior of transformer architectures over long inputs.

The standard attention graph is either all-to-all or causal, both of which scales as $O(N^2)$ where $N$ is the number of tokens in a sequence. In both cases, there are $O(N^2)$ pairs of tokens such that one influences the other within the attention block. By pruning the attention graph, the number of pairs of token influences can drop below $O(N^2)$. Such architectures are often referred to as *sparse* attention, or sparse Transformers.

Sparse attention[^c1fn81] uses attention graphs that grows slower than $O(N^2)$. For example, BigBird (2020)[^c1fn82] uses random [small-world networks](https://en.wikipedia.org/wiki/Small-world_network "Small-world network") which grows as $O(N)$.

### Multimodality

Transformers can also be used/adapted for modalities (input or output) beyond just text, usually by finding a way to "tokenize" the modality.

Multimodal models can either be trained from scratch, or by finetuning. A 2022 study found that transformers pretrained only on natural language can be finetuned on only 0.03% of parameters and become competitive with [LSTMs](https://en.wikipedia.org/wiki/LSTMs "LSTMs") on a variety of logical and visual tasks, demonstrating [transfer learning](https://en.wikipedia.org/wiki/Transfer_learning "Transfer learning").[^c1fn83] The LLaVA was a vision-language model composed of a language model (Vicuna-13B)[^c1fn84] and a vision model ([ViT](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer")-L/14), connected by a linear layer. Only the linear layer is finetuned.[^c1fn85]

[Vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer") adapt the transformer to computer vision by breaking down input images as a series of patches, turning them into vectors, and treating them like embedding vectors of tokens in a standard transformer.

Conformer and later [Whisper](https://en.wikipedia.org/wiki/Whisper_%28speech_recognition_system%29 "Whisper (speech recognition system)")[^c1fn86] follow the same pattern for [speech recognition](https://en.wikipedia.org/wiki/Speech_recognition "Speech recognition"), first turning the speech signal into a [spectrogram](https://en.wikipedia.org/wiki/Spectrogram "Spectrogram"), which is then treated like an image, i.e. broken down into a series of patches, turned into vectors and treated like embedding vector of tokens in a standard transformer.

[Perceivers](https://en.wikipedia.org/wiki/Perceiver "Perceiver")[^c1fn87][^c1fn88] are a variant of transformers designed for multimodality.

For image generation, notable architectures are [DALL-E 1](https://en.wikipedia.org/wiki/DALL-E "DALL-E") (2021), Parti (2022),[^c1fn89] Phenaki (2023),[^c1fn90] and Muse (2023).[^c1fn91] Unlike later models, DALL-E is not a [diffusion model](https://en.wikipedia.org/wiki/Diffusion_model "Diffusion model"). Instead, it uses a decoder-only transformer that autoregressively generates a text, followed by the token representation of an image, which is then converted by a [variational autoencoder](https://en.wikipedia.org/wiki/Variational_autoencoder "Variational autoencoder") to an image.[^c1fn92] Parti is an encoder–decoder transformer, where the encoder processes a text prompt, and the decoder generates a token representation of an image.[^c1fn93] Muse is an encoder-only transformer that is trained to predict masked image tokens from unmasked image tokens. During generation, all input tokens are masked, and the highest-confidence predictions are included for the next iteration, until all tokens are predicted.[^c1fn91] Phenaki is a text-to-video model. It is a bidirectional masked transformer conditioned on pre-computed text tokens. The generated tokens are then decoded to a video.[^c1fn90]

## Applications

The transformer has had great success in [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") (NLP). Many [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model") such as [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2"), [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3"), [GPT-4](https://en.wikipedia.org/wiki/GPT-4 "GPT-4"), [Gemini](https://en.wikipedia.org/wiki/Gemini_%28chatbot%29 "Gemini (chatbot)"), AlbertAGPT, [Claude](https://en.wikipedia.org/wiki/Claude_%28AI%29 "Claude (AI)"), [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)"), [Grok](https://en.wikipedia.org/wiki/Grok_%28chatbot%29 "Grok (chatbot)"), [XLNet](https://en.wikipedia.org/wiki/XLNet "XLNet"), [RoBERTa](https://en.wikipedia.org/wiki/BERT_%28language_model%29#RoBERTa "BERT (language model)") and [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT") demonstrate the ability of transformers to perform a wide variety of NLP-related subtasks and their related real-world applications, including:

- [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation")
- [time series](https://en.wikipedia.org/wiki/Time_series "Time series") prediction
- [document summarization](https://en.wikipedia.org/wiki/Automatic_summarization "Automatic summarization")
- [document generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation")
- [named entity recognition](https://en.wikipedia.org/wiki/Named-entity_recognition "Named-entity recognition") (NER)[^c1fn94]
- [writing computer code](https://en.wikipedia.org/wiki/Computer_programming "Computer programming") based on requirements expressed in natural language.
- [speech-to-text](https://en.wikipedia.org/wiki/Speech-to-text "Speech-to-text")

Beyond traditional NLP, the transformer architecture has had success in other applications, such as:

- [biological sequence analysis](https://en.wikipedia.org/wiki/Sequence_analysis "Sequence analysis")
- [video understanding](https://en.wikipedia.org/wiki/Computer_vision "Computer vision")
- [protein folding](https://en.wikipedia.org/wiki/Protein_structure_prediction "Protein structure prediction") (such as [AlphaFold](https://en.wikipedia.org/wiki/AlphaFold "AlphaFold"))
- [evaluating](https://en.wikipedia.org/wiki/Evaluation_function "Evaluation function") chess board positions. Using static evaluation alone (that is, with no [Minimax](https://en.wikipedia.org/wiki/Minimax "Minimax") search) transformer achieved an [Elo](https://en.wikipedia.org/wiki/Elo_rating_system "Elo rating system") of 2895, putting it at [grandmaster](https://en.wikipedia.org/wiki/Grandmaster_%28chess%29 "Grandmaster (chess)") level.[^c1fn8]
- service function chain embedding[^c1fn95]

[^c1fn1]: [Vaswani, Ashish](https://en.wikipedia.org/wiki/Ashish_Vaswani "Ashish Vaswani"); Shazeer, Noam; Parmar, Niki; Uszkoreit, Jakob; Jones, Llion; [Gomez, Aidan N](https://en.wikipedia.org/wiki/Aidan_Gomez "Aidan Gomez"); Kaiser, Łukasz; Polosukhin, Illia (2017). ["Attention is All You Need"](https://web.archive.org/web/20240221141113/https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf) ( (PDF)). *31st Conference on Neural Information Processing Systems (NIPS 2017), 4-9 December 2017, Long Beach, CA, USA*. Vol. 30. Curran Associates, Inc. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1706.03762](https://arxiv.org/abs/1706.03762). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-5108-6096-4](https://en.wikipedia.org/wiki/Special:BookSources/978-1-5108-6096-4 "Special:BookSources/978-1-5108-6096-4"). Archived from [the original](https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf) on 2024-02-21. Retrieved 2023-10-31.

[^c1fn2]: [Hochreiter, Sepp](https://en.wikipedia.org/wiki/Sepp_Hochreiter "Sepp Hochreiter"); [Schmidhuber, Jürgen](https://en.wikipedia.org/wiki/Jürgen_Schmidhuber "Jürgen Schmidhuber") (November 1997). "Long Short-Term Memory". *Neural Computation*. **9** (8): 1735–1780. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/neco.1997.9.8.1735](https://doi.org/10.1162%2Fneco.1997.9.8.1735). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [9377276](https://pubmed.ncbi.nlm.nih.gov/9377276).

[^c1fn3]: Bahdanau; Cho, Kyunghyun; Bengio, Yoshua (September 1, 2014). "Neural Machine Translation by Jointly Learning to Align and Translate". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.0473](https://arxiv.org/abs/1409.0473) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn4]: Luong, Minh-Thang; Pham, Hieu; Manning, Christopher D. (August 17, 2015). "Effective Approaches to Attention-based Neural Machine Translation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1508.04025](https://arxiv.org/abs/1508.04025) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn5]: Parisotto, Emilio; Song, Francis; Rae, Jack; Pascanu, Razvan; Gulcehre, Caglar; Jayakumar, Siddhant; Jaderberg, Max; Kaufman, Raphaël Lopez; Clark, Aidan; Noury, Seb; Botvinick, Matthew; Heess, Nicolas; Hadsell, Raia (2020-11-21). ["Stabilizing Transformers for Reinforcement Learning"](https://proceedings.mlr.press/v119/parisotto20a.html). *Proceedings of the 37th International Conference on Machine Learning*. PMLR: 7487–7498. [Archived](https://web.archive.org/web/20240809053144/https://proceedings.mlr.press/v119/parisotto20a.html) from the original on 2024-08-09. Retrieved 2024-08-09.

[^c1fn6]: Radford, Alec; Jong Wook Kim; Xu, Tao; Brockman, Greg; McLeavey, Christine; Sutskever, Ilya (2022). "Robust Speech Recognition via Large-Scale Weak Supervision". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2212.04356](https://arxiv.org/abs/2212.04356) [[eess.AS](https://arxiv.org/archive/eess.AS)].

[^c1fn7]: Monastirsky, Maxim; Azulay, Osher; Sintov, Avishai (February 2023). "Learning to Throw With a Handful of Samples Using Decision Transformers". *IEEE Robotics and Automation Letters*. **8** (2): 576–583. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2023IRAL....8..576M](https://scixplorer.org/abs/2023IRAL....8..576M). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/LRA.2022.3229266](https://doi.org/10.1109%2FLRA.2022.3229266).

[^c1fn8]: Ruoss, Anian; Delétang, Grégoire; Medapati, Sourabh; Grau-Moya, Jordi; Wenliang, Li; Catt, Elliot; Reid, John; Genewein, Tim (2024-02-07). "Grandmaster-Level Chess Without Search". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2402.04494v1](https://arxiv.org/abs/2402.04494v1) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn9]: Wolf, Thomas; Debut, Lysandre; Sanh, Victor; Chaumond, Julien; Delangue, Clement; Moi, Anthony; Cistac, Pierric; Rault, Tim; Louf, Remi; Funtowicz, Morgan; Davison, Joe; Shleifer, Sam; von Platen, Patrick; Ma, Clara; Jernite, Yacine; Plu, Julien; Xu, Canwen; Le Scao, Teven; Gugger, Sylvain; Drame, Mariama; Lhoest, Quentin; Rush, Alexander (2020). "Transformers: State-of-the-Art Natural Language Processing". *Proceedings of the 2020 Conference on Empirical Methods in Natural Language Processing: System Demonstrations*. pp. 38–45. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2020.emnlp-demos.6](https://doi.org/10.18653%2Fv1%2F2020.emnlp-demos.6).

[^c1fn10]: [Gated recurrent units](https://en.wikipedia.org/wiki/Gated_recurrent_units "Gated recurrent units") (2014) further reduced its complexity.

[^c1fn11]: Feldman, J; Ballard, D (September 1982). "Connectionist models and their properties". *Cognitive Science*. **6** (3): 205–254. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/S0364-0213(82)80001-3](https://doi.org/10.1016%2FS0364-0213%2882%2980001-3).

[^c1fn12]: Rumelhart, David E.; Hinton, Geoffrey E.; McClelland, James L. (1986). "Interactive Processes in Speech Perception". *Parallel Distributed Processing*. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.7551/mitpress/5236.003.0005](https://doi.org/10.7551%2Fmitpress%2F5236.003.0005). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-0-262-29140-8](https://en.wikipedia.org/wiki/Special:BookSources/978-0-262-29140-8 "Special:BookSources/978-0-262-29140-8").

[^c1fn13]: Giles, C. Lee; Maxwell, Tom (December 1987). "Learning, invariance, and generalization in high-order neural networks". *Applied Optics*. **26** (23): 4972–4978. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1364/AO.26.004972](https://doi.org/10.1364%2FAO.26.004972). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [20523475](https://pubmed.ncbi.nlm.nih.gov/20523475).

[^c1fn14]: Some architectures, such as RWKV (Receptance Weighted Key Value) or state space models, avoid the issue.

[^c1fn15]: Cho, Kyunghyun; van Merriënboer, Bart; Gulcehre, Caglar; Bahdanau, Dzmitry; Bougares, Fethi; Schwenk, Holger; Bengio, Yoshua (October 2014). ["Learning Phrase Representations using RNN Encoder–Decoder for Statistical Machine Translation"](https://aclanthology.org/D14-1179). In Moschitti, Alessandro; Pang, Bo; Daelemans, Walter (eds.). *Proceedings of the 2014 Conference on Empirical Methods in Natural Language Processing (EMNLP)*. Doha, Qatar: Association for Computational Linguistics. pp. 1724–1734. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1406.1078](https://arxiv.org/abs/1406.1078). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.3115/v1/D14-1179](https://doi.org/10.3115%2Fv1%2FD14-1179). [Archived](https://web.archive.org/web/20240906214240/https://aclanthology.org/D14-1179/) from the original on 2024-09-06. Retrieved 2024-08-09.

[^c1fn16]: Sutskever, Ilya; Vinyals, Oriol; Le, Quoc Viet (14 Dec 2014). "Sequence to sequence learning with neural networks". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.3215](https://arxiv.org/abs/1409.3215) [[cs.CL](https://arxiv.org/archive/cs.CL)]. [first version posted to arXiv on 10 Sep 2014]

[^c1fn17]: Chung, Junyoung; Gulcehre, Caglar; Cho, KyungHyun; Bengio, Yoshua (2014). "Empirical Evaluation of Gated Recurrent Neural Networks on Sequence Modeling". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1412.3555](https://arxiv.org/abs/1412.3555) [[cs.NE](https://arxiv.org/archive/cs.NE)].

[^c1fn18]: Gruber, Nicole; Jockisch, Alfred (30 June 2020). ["Are GRU Cells More Specific and LSTM Cells More Sensitive in Motive Classification of Text?"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7861254). *Frontiers in Artificial Intelligence*. **3** 40. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.3389/frai.2020.00040](https://doi.org/10.3389%2Ffrai.2020.00040). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [7861254](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7861254). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [33733157](https://pubmed.ncbi.nlm.nih.gov/33733157).

[^c1fn19]: Sutskever, Ilya; Vinyals, Oriol; Le, Quoc V (2014). ["Sequence to Sequence Learning with Neural Networks"](https://web.archive.org/web/20250127094117/https://proceedings.neurips.cc/paper/2014/hash/a14ac55a4f27472c5d894ec1c3c743d2-Abstract.html). *Advances in Neural Information Processing Systems*. **27**. Curran Associates, Inc. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.3215](https://arxiv.org/abs/1409.3215). Archived from [the original](https://proceedings.neurips.cc/paper/2014/hash/a14ac55a4f27472c5d894ec1c3c743d2-Abstract.html) on 2025-01-27. Retrieved 2024-07-23.

[^c1fn20]: Luong, Minh-Thang; Pham, Hieu; Manning, Christopher D. (2015). "Effective Approaches to Attention-based Neural Machine Translation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1508.04025](https://arxiv.org/abs/1508.04025) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn21]: Wu, Yonghui; et al. (2016-09-01). "Google's Neural Machine Translation System: Bridging the Gap between Human and Machine Translation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1609.08144](https://arxiv.org/abs/1609.08144) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn22]: Lewis-Kraus, Gideon (2016-12-14). ["The Great A.I. Awakening"](https://web.archive.org/web/20230524052626/https://www.nytimes.com/2016/12/14/magazine/the-great-ai-awakening.html). *The New York Times*. Archived from [the original](https://www.nytimes.com/2016/12/14/magazine/the-great-ai-awakening.html) on 24 May 2023. Retrieved 2023-06-22.

[^c1fn23]: Parikh, Ankur P.; Täckström, Oscar; Das, Dipanjan; Uszkoreit, Jakob (2016-09-25). "A Decomposable Attention Model for Natural Language Inference". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1606.01933](https://arxiv.org/abs/1606.01933) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn24]: Levy, Steven. ["8 Google Employees Invented Modern AI. Here's the Inside Story"](https://www.wired.com/story/eight-google-employees-invented-modern-ai-transformers-paper/). *Wired*. [Archived](https://web.archive.org/web/20240320101528/https://www.wired.com/story/eight-google-employees-invented-modern-ai-transformers-paper/) from the original on 20 Mar 2024. Retrieved 2024-08-06.

[^c1fn25]: Cheng, Jianpeng; Dong, Li; Lapata, Mirella (November 2016). ["Long Short-Term Memory-Networks for Machine Reading"](https://aclanthology.org/D16-1053/). In Su, Jian; Duh, Kevin; Carreras, Xavier (eds.). *Proceedings of the 2016 Conference on Empirical Methods in Natural Language Processing*. Austin, Texas: Association for Computational Linguistics. pp. 551–561. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/D16-1053](https://doi.org/10.18653%2Fv1%2FD16-1053). [Archived](https://web.archive.org/web/20240827143929/https://aclanthology.org/D16-1053/) from the original on 2024-08-27. Retrieved 2024-08-27.

[^c1fn26]: Peng, Bo; Alcaide, Eric; Anthony, Quentin; Albalak, Alon; Arcadinho, Samuel; Biderman, Stella; Cao, Huanqi; Cheng, Xin; Chung, Michael (2023-12-10). "RWKV: Reinventing RNNs for the transformer Era". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2305.13048](https://arxiv.org/abs/2305.13048) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn27]: Marche, Stephen (2024-08-23). ["Was Linguistic A.I. Created by Accident?"](https://www.newyorker.com/science/annals-of-artificial-intelligence/was-linguistic-ai-created-by-accident). *The New Yorker*. Retrieved 2024-08-27.

[^c1fn28]: Vaswani, Ashish; Bengio, Samy; Brevdo, Eugene; Chollet, Francois; Gomez, Aidan; Gouws, Stephan; Jones, Llion; Kaiser, Łukasz; Kalchbrenner, Nal; Parmar, Niki; Sepassi, Ryan; Shazeer, Noam; Uszkoreit, Jakob (March 2018). Cherry, Colin; Neubig, Graham (eds.). ["Tensor2Tensor for Neural Machine Translation"](https://aclanthology.org/W18-1819/). *Proceedings of the 13th Conference of the Association for Machine Translation in the Americas (Volume 1: Research Track)*. Boston, MA: Association for Machine Translation in the Americas: 193–199. [Archived](https://web.archive.org/web/20260429230143/https://aclanthology.org/W18-1819/) from the original on 2026-04-29. Retrieved 2026-03-31.

[^c1fn29]: Kaiser, Łukasz (2017-06-19). ["Accelerating Deep Learning Research with the Tensor2Tensor Library"](https://research.google/blog/accelerating-deep-learning-research-with-the-tensor2tensor-library/). *Google Research Blog*. [Archived](https://web.archive.org/web/20260415200010/https://research.google/blog/accelerating-deep-learning-research-with-the-tensor2tensor-library/) from the original on 2026-04-15. Retrieved 2026-03-31.

[^c1fn30]: Devlin, Jacob; Chang, Ming-Wei; Lee, Kenton; Toutanova, Kristina (11 October 2018). "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1810.04805v2](https://arxiv.org/abs/1810.04805v2) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn31]: ["Google: BERT now used on almost every English query"](https://searchengineland.com/google-bert-used-on-almost-every-english-query-342193). *Search Engine Land*. 2020-10-15. [Archived](https://web.archive.org/web/20220506220519/https://searchengineland.com/google-bert-used-on-almost-every-english-query-342193) from the original on 2022-05-06. Retrieved 2020-11-24.

[^c1fn32]: Caswell, Isaac; Liang, Bowen (June 8, 2020). ["Recent Advances in Google Translate"](https://research.google/blog/recent-advances-in-google-translate/). *Google Research*. [Archived](https://web.archive.org/web/20240704042433/https://research.google/blog/recent-advances-in-google-translate/) from the original on 4 Jul 2024. Retrieved 2024-08-07.

[^c1fn33]: ["The inside story of how ChatGPT was built from the people who made it"](https://www.technologyreview.com/2023/03/03/1069311/inside-story-oral-history-how-chatgpt-built-openai/). *MIT Technology Review*. [Archived](https://web.archive.org/web/20230303093219/https://www.technologyreview.com/2023/03/03/1069311/inside-story-oral-history-how-chatgpt-built-openai/) from the original on 2023-03-03. Retrieved 2024-08-06.

[^c1fn34]: ["Introducing ChatGPT"](https://openai.com/index/chatgpt/). *OpenAI*. 2022-11-30. [Archived](https://web.archive.org/web/20260405004654/https://openai.com/index/chatgpt/) from the original on 2026-04-05. Retrieved 2026-05-16.

[^c1fn35]: Deign, Jason (December 6, 2024). ["How ChatGPT changed… well, almost everything"](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2024/m12/how-chatgpt-changed-well-almost-everything.html). *Cisco Newsroom*. Retrieved 2026-10-22.

[^c1fn36]: Kaiser, Lukasz; Gomez, Aidan N.; Shazeer, Noam; Vaswani, Ashish; Parmar, Niki; Jones, Llion; Uszkoreit, Jakob (2017-06-16). "One Model To Learn Them All". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1706.05137v1](https://arxiv.org/abs/1706.05137v1) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn37]: Liu, Zhuang; Mao, Hanzi; Wu, Chao-Yuan; Feichtenhofer, Christoph; Darrell, Trevor; Xie, Saining (2022). [*A ConvNet for the 2020s*](https://openaccess.thecvf.com/content/CVPR2022/html/Liu_A_ConvNet_for_the_2020s_CVPR_2022_paper.html). Conference on Computer Vision and Pattern Recognition ([CVPR](https://en.wikipedia.org/wiki/CVPR "CVPR")). pp. 11976–11986.

[^c1fn38]: Xiong, Ruibin; Yang, Yunchang; He, Di; Zheng, Kai; Zheng, Shuxin; Xing, Chen; Zhang, Huishuai; Lan, Yanyan; Wang, Liwei; Liu, Tie-Yan (2020-06-29). "On Layer Normalization in the Transformer Architecture". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2002.04745](https://arxiv.org/abs/2002.04745) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn39]: Vaswani, Ashish; Shazeer, Noam; Parmar, Niki; Uszkoreit, Jakob; Jones, Llion; Gomez, Aidan N; Kaiser, Ł ukasz; Polosukhin, Illia (2017). ["Attention is All you Need"](https://papers.neurips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html). *Advances in Neural Information Processing Systems*. **30**. Curran Associates, Inc.

[^c1fn40]: Narayanan, Deepak; Harlap, Aaron; Phanishayee, Amar; Seshadri, Vivek; Devanur, Nikhil R.; Ganger, Gregory R.; Gibbons, Phillip B.; Zaharia, Matei (2019). "PipeDream: Generalized pipeline parallelism for DNN training". *Proceedings of the 27th ACM Symposium on Operating Systems Principles*. pp. 1–15. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3341301.3359646](https://doi.org/10.1145%2F3341301.3359646). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-4503-6873-5](https://en.wikipedia.org/wiki/Special:BookSources/978-1-4503-6873-5 "Special:BookSources/978-1-4503-6873-5").

[^c1fn41]: Raffel, Colin; Shazeer, Noam; Roberts, Adam; Lee, Katherine; Narang, Sharan; Matena, Michael; Zhou, Yanqi; Li, Wei; Liu, Peter J. (2020). ["Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer"](https://www.jmlr.org/papers/v21/20-074.html). *Journal of Machine Learning Research*. **21** (140): 1–67. [Archived](https://web.archive.org/web/20260410072046/https://jmlr.org/papers/v21/20-074.html) from the original on 2026-04-10. Retrieved 2026-04-18.

[^c1fn42]: Raffel, Colin; Shazeer, Noam; Roberts, Adam; Lee, Katherine; Narang, Sharan; Matena, Michael; Zhou, Yanqi; Li, Wei; Liu, Peter J. (2019). "Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1910.10683](https://arxiv.org/abs/1910.10683) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn43]: ["Masked language modeling"](https://huggingface.co/docs/transformers/tasks/masked_language_modeling). *huggingface.co*. [Archived](https://web.archive.org/web/20231010083915/https://huggingface.co/docs/transformers/tasks/masked_language_modeling) from the original on 2023-10-10. Retrieved 2023-10-05.

[^c1fn44]: ["Causal language modeling"](https://huggingface.co/docs/transformers/tasks/language_modeling). *huggingface.co*. [Archived](https://web.archive.org/web/20231010083913/https://huggingface.co/docs/transformers/tasks/language_modeling) from the original on 2023-10-10. Retrieved 2023-10-05.

[^c1fn45]: Tay, Yi; Dehghani, Mostafa; Tran, Vinh Q.; Garcia, Xavier; Wei, Jason; Wang, Xuezhi; Chung, Hyung Won; Shakeri, Siamak; Bahri, Dara (2023-02-28). "UL2: Unifying Language Learning Paradigms". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2205.05131](https://arxiv.org/abs/2205.05131) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn46]: Team, Keras. ["Keras documentation: GPT2Backbone model"](https://keras.io/api/keras_nlp/models/gpt2/gpt2_backbone/). *keras.io*. [Archived](https://web.archive.org/web/20240808085714/https://keras.io/api/keras_nlp/models/gpt2/gpt2_backbone/) from the original on 2024-08-08. Retrieved 2024-08-08.

[^c1fn47]: Clark, Kevin; Khandelwal, Urvashi; Levy, Omer; Manning, Christopher D. (August 2019). ["What Does BERT Look at? An Analysis of BERT's Attention"](https://www.aclweb.org/anthology/W19-4828). *Proceedings of the 2019 ACL Workshop BlackboxNLP: Analyzing and Interpreting Neural Networks for NLP*. Florence, Italy: Association for Computational Linguistics: 276–286. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1906.04341](https://arxiv.org/abs/1906.04341). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/W19-4828](https://doi.org/10.18653%2Fv1%2FW19-4828). [Archived](https://web.archive.org/web/20201021211357/https://www.aclweb.org/anthology/W19-4828/) from the original on 2020-10-21. Retrieved 2020-05-20.

[^c1fn48]: Yang, Zhilin; Dai, Zihang; Yang, Yiming; Carbonell, Jaime; Salakhutdinov, Russ R; Le, Quoc V (2019). ["XLNet: Generalized Autoregressive Pretraining for Language Understanding"](https://proceedings.neurips.cc/paper/2019/hash/dc6a7e655d7e5840e66733e9ee67cc69-Abstract.html). *Advances in Neural Information Processing Systems*. **32**. Curran Associates, Inc. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1906.08237](https://arxiv.org/abs/1906.08237). [Archived](https://web.archive.org/web/20240809053521/https://proceedings.neurips.cc/paper/2019/hash/dc6a7e655d7e5840e66733e9ee67cc69-Abstract.html) from the original on 2024-08-09. Retrieved 2024-08-09.

[^c1fn49]: Wang, Qiang; Li, Bei; Xiao, Tong; Zhu, Jingbo; Li, Changliang; Wong, Derek F.; Chao, Lidia S. (2019-06-04). "Learning Deep Transformer Models for Machine Translation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1906.01787](https://arxiv.org/abs/1906.01787) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn50]: Phuong, Mary; Hutter, Marcus (2022-07-19). "Formal Algorithms for Transformers". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2207.09238](https://arxiv.org/abs/2207.09238) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn51]: Dong, Li; Yang, Nan; Wang, Wenhui; Wei, Furu; Liu, Xiaodong; Wang, Yu; Gao, Jianfeng; Zhou, Ming; Hon, Hsiao-Wuen (2019). ["Unified Language Model Pre-training for Natural Language Understanding and Generation"](https://proceedings.neurips.cc/paper_files/paper/2019/hash/c20bb2d9a50d5ac1f713f8b34d9aac5a-Abstract.html). *Advances in Neural Information Processing Systems*. **32**. Curran Associates, Inc.

[^c1fn52]: Gu, Albert; Dao, Tri (2023-12-01). "Mamba: Linear-Time Sequence Modeling with Selective State Spaces". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2312.00752](https://arxiv.org/abs/2312.00752) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn53]: Shazeer, Noam (2020-02-01). "GLU Variants Improve Transformer". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2002.05202](https://arxiv.org/abs/2002.05202) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn54]: Hendrycks, Dan; Gimpel, Kevin (2016-06-27). "Gaussian Error Linear Units (GELUs)". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1606.08415v5](https://arxiv.org/abs/1606.08415v5) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn55]: Zhang, Biao; Sennrich, Rico (2019). ["Root Mean Square Layer Normalization"](https://proceedings.neurips.cc/paper/2019/hash/1e8a19426224ca89e83cef47f1e7f53b-Abstract.html). *Advances in Neural Information Processing Systems*. **32**. Curran Associates, Inc. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1910.07467](https://arxiv.org/abs/1910.07467). [Archived](https://web.archive.org/web/20240917113737/https://proceedings.neurips.cc/paper/2019/hash/1e8a19426224ca89e83cef47f1e7f53b-Abstract.html) from the original on 2024-09-17. Retrieved 2024-08-09.

[^c1fn56]: Nguyen, Toan Q.; Salazar, Julian (2019-11-02). Niehues, Jan; Cattoni, Rolando; Stüker, Sebastian; Negri, Matteo; Turchi, Marco; Ha, Thanh-Le; Salesky, Elizabeth; Sanabria, Ramon; Barrault, Loic (eds.). ["Transformers without Tears: Improving the Normalization of Self-Attention"](https://aclanthology.org/2019.iwslt-1.17). *Proceedings of the 16th International Conference on Spoken Language Translation*. Hong Kong: Association for Computational Linguistics. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1910.05895](https://arxiv.org/abs/1910.05895). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.5281/zenodo.3525484](https://doi.org/10.5281%2Fzenodo.3525484). [Archived](https://web.archive.org/web/20240809185028/https://aclanthology.org/2019.iwslt-1.17/) from the original on 2024-08-09. Retrieved 2024-08-09.

[^c1fn57]: Dufter, Philipp; Schmitt, Martin; Schütze, Hinrich (September 2022). ["Position Information in Transformers: An Overview"](https://doi.org/10.1162%2Fcoli_a_00445). *Computational Linguistics*. **48** (3): 733–763. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2102.11090](https://arxiv.org/abs/2102.11090). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/coli\_a\_00445](https://doi.org/10.1162%2Fcoli_a_00445).

[^c1fn58]: Gehring, Jonas; Auli, Michael; Grangier, David; Yarats, Denis; Dauphin, Yann N. (2017-07-17). ["Convolutional Sequence to Sequence Learning"](https://proceedings.mlr.press/v70/gehring17a.html). *Proceedings of the 34th International Conference on Machine Learning*. PMLR: 1243–1252. [Archived](https://web.archive.org/web/20240809184100/https://proceedings.mlr.press/v70/gehring17a.html) from the original on 2024-08-09. Retrieved 2024-08-09.

[^c1fn59]: Haviv, Adi; Ram, Ori; Press, Ofir; Izsak, Peter; Levy, Omer (2022-12-05). "Transformer Language Models without Positional Encodings Still Learn Positional Information". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2203.16634](https://arxiv.org/abs/2203.16634) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn60]: Kwon, Woosuk; Li, Zhuohan; Zhuang, Siyuan; Sheng, Ying; Zheng, Lianmin; Yu, Cody Hao; Gonzalez, Joseph; Zhang, Hao; Stoica, Ion (2023). "Efficient Memory Management for Large Language Model Serving with PagedAttention". *Proceedings of the 29th Symposium on Operating Systems Principles*. pp. 611–626. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3600006.3613165](https://doi.org/10.1145%2F3600006.3613165). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-0229-7](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-0229-7 "Special:BookSources/979-8-4007-0229-7").

[^c1fn61]: ["vllm-project/vllm"](https://github.com/vllm-project/vllm). vLLM. 2024-06-20. [Archived](https://web.archive.org/web/20240618204642/https://github.com/vllm-project/vllm) from the original on 2024-06-18. Retrieved 2024-06-20.

[^c1fn62]: Zhuohan Li, Woosuk Kwon; Zhuang, Siyuan; Sheng, Ying; Zheng, Lianmin; Yu, Cody; Gonzalez, Joey; Zhang, Hao; Stoica, Ion (2023-06-20). ["vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention"](https://blog.vllm.ai/2023/06/20/vllm.html). *vLLM Blog*. [Archived](https://web.archive.org/web/20240620205208/https://blog.vllm.ai/2023/06/20/vllm.html) from the original on 2024-06-20. Retrieved 2024-06-20.

[^c1fn63]: Hu, Cunchen; Huang, Heyang; Xu, Liangliang; Chen, Xusheng; Xu, Jiang; Chen, Shuang; Feng, Hao; Wang, Chenxi; Wang, Sa (2024-01-20). "Inference without Interference: Disaggregate LLM Inference for Mixed Downstream Workloads". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2401.11181](https://arxiv.org/abs/2401.11181) [[cs.DC](https://arxiv.org/archive/cs.DC)].

[^c1fn64]: Yu, Gyeong-In; Jeong, Joo Seong; Kim, Geon-Woo; Kim, Soojeong; Chun, Byung-Gon (2022). [*Orca: A Distributed Serving System for Transformer-Based Generative Models*](https://www.usenix.org/conference/osdi22/presentation/yu). pp. 521–538. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-939133-28-1](https://en.wikipedia.org/wiki/Special:BookSources/978-1-939133-28-1 "Special:BookSources/978-1-939133-28-1").

[^c1fn65]: Dettmers, Tim; Lewis, Mike; Belkada, Younes; Zettlemoyer, Luke (2022-08-15). "LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2208.07339v2](https://arxiv.org/abs/2208.07339v2) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn66]: Dao, Tri; Ermon, Stefano; Fu, Dan; Ré, Christopher; Rudra, Atri (2022). "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness". *Advances in Neural Information Processing Systems 35*. pp. 16344–16359. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2205.14135](https://arxiv.org/abs/2205.14135). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.52202/068431-1189](https://doi.org/10.52202%2F068431-1189). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-7138-7108-8](https://en.wikipedia.org/wiki/Special:BookSources/978-1-7138-7108-8 "Special:BookSources/978-1-7138-7108-8").

[^c1fn67]: Milakov, Maxim; Gimelshein, Natalia (2018). "Online normalizer calculation for softmax". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1805.02867](https://arxiv.org/abs/1805.02867) [[cs.PF](https://arxiv.org/archive/cs.PF)].

[^c1fn68]: ["FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning"](https://crfm.stanford.edu/2023/07/17/flash2.html). *crfm.stanford.edu*. [Archived](https://web.archive.org/web/20230718103613/https://crfm.stanford.edu/2023/07/17/flash2.html) from the original on 2023-07-18. Retrieved 2023-07-18.

[^c1fn69]: Chowdhery, Aakanksha; Narang, Sharan; Devlin, Jacob; Bosma, Maarten; Mishra, Gaurav; Roberts, Adam; Barham, Paul; Chung, Hyung Won; Sutton, Charles; Gehrmann, Sebastian; Schuh, Parker; Shi, Kensen; Tsvyashchenko, Sasha; Maynez, Joshua; Rao, Abhishek (2022-04-01). "PaLM: Scaling Language Modeling with Pathways". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2204.02311](https://arxiv.org/abs/2204.02311) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn70]: Ainslie, Joshua; Lee-Thorp, James; de Jong, Michiel; Zemlyanskiy, Yury; Lebrón, Federico; Sanghai, Sumit (2023-12-23). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2305.13245](https://arxiv.org/abs/2305.13245) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn71]: DeepSeek-AI; Liu, Aixin; Feng, Bei; Wang, Bin; Wang, Bingxuan; Liu, Bo; Zhao, Chenggang; Dengr, Chengqi; Ruan, Chong (19 June 2024). "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2405.04434](https://arxiv.org/abs/2405.04434) [[cs.CL](https://arxiv.org/archive/cs.CL)]..

[^c1fn72]: Leviathan, Yaniv; Kalman, Matan; Matias, Yossi (2023-05-18). "Fast Inference from Transformers via Speculative Decoding". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2211.17192](https://arxiv.org/abs/2211.17192) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn73]: Fu, Yao (2023-12-11). ["Towards 100x Speedup: Full Stack Transformer Inference Optimization"](https://yaofu.notion.site/Towards-100x-Speedup-Full-Stack-Transformer-Inference-Optimization-43124c3688e14cffaf2f1d6cbdf26c6c). *yaofu.notion.site*.

[^c1fn74]: Chen, Charlie; Borgeaud, Sebastian; Irving, Geoffrey; Lespiau, Jean-Baptiste; Sifre, Laurent; Jumper, John (2023-02-02). "Accelerating Large Language Model Decoding with Speculative Sampling". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2302.01318](https://arxiv.org/abs/2302.01318) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn75]: Gloeckle, Fabian; Badr Youbi Idrissi; Rozière, Baptiste; Lopez-Paz, David; Synnaeve, Gabriel (2024). "Better & Faster Large Language Models via Multi-token Prediction". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2404.19737](https://arxiv.org/abs/2404.19737) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn76]: DeepSeek-AI; et al. (2024). "DeepSeek-V3 Technical Report". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2412.19437](https://arxiv.org/abs/2412.19437) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c1fn77]: Kitaev, Nikita; Kaiser, Łukasz; Levskaya, Anselm (2020). "Reformer: The Efficient Transformer". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2001.04451](https://arxiv.org/abs/2001.04451) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn78]: Liu, Ze; Lin, Yutong; Cao, Yue; Hu, Han; Wei, Yixuan; Zhang, Zheng; Lin, Stephen; Guo, Baining (2021). "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows". *2021 IEEE/CVF International Conference on Computer Vision (ICCV)*. IEEE. pp. 9992–10002. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2103.14030](https://arxiv.org/abs/2103.14030). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/ICCV48922.2021.00986](https://doi.org/10.1109%2FICCV48922.2021.00986). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-6654-2812-5](https://en.wikipedia.org/wiki/Special:BookSources/978-1-6654-2812-5 "Special:BookSources/978-1-6654-2812-5").

[^c1fn79]: Ristea, Nicolaea Catalin; Ionescu, Radu Tudor; Khan, Fahad Shahbaz (2022-09-18). ["SepTr: Separable Transformer for Audio Spectrogram Processing"](https://www.isca-archive.org/interspeech_2022/ristea22_interspeech.html). *Interspeech*. ISCA: 4103–4107. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2203.09581](https://arxiv.org/abs/2203.09581). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.21437/Interspeech.2022-249](https://doi.org/10.21437%2FInterspeech.2022-249).

[^c1fn80]: Tay, Yi; Dehghani, Mostafa; Abnar, Samira; Shen, Yikang; Bahri, Dara; Pham, Philip; Rao, Jinfeng; Yang, Liu; Ruder, Sebastian; Metzler, Donald (2020-11-08). "Long Range Arena: A Benchmark for Efficient Transformers". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2011.04006](https://arxiv.org/abs/2011.04006) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn81]: Child, Rewon; Gray, Scott; Radford, Alec; Sutskever, Ilya (2019-04-23). "Generating Long Sequences with Sparse Transformers". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1904.10509](https://arxiv.org/abs/1904.10509) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn82]: ["Constructing Transformers For Longer Sequences with Sparse Attention Methods"](https://ai.googleblog.com/2021/03/constructing-transformers-for-longer.html). *Google AI Blog*. 25 March 2021. [Archived](https://web.archive.org/web/20210918150757/https://ai.googleblog.com/2021/03/constructing-transformers-for-longer.html) from the original on 2021-09-18. Retrieved 2021-05-28.

[^c1fn83]: Lu, Kevin; Grover, Aditya; Abbeel, Pieter; Mordatch, Igor (2022). "Frozen Pretrained Transformers as Universal Computation Engines". *Proceedings of the AAAI Conference on Artificial Intelligence*. **36** (7): 7628–7636. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1609/aaai.v36i7.20729](https://doi.org/10.1609%2Faaai.v36i7.20729).

[^c1fn84]: ["Vicuna: An Open-Source Chatbot Impressing GPT-4 with 90%\* ChatGPT Quality | LMSYS Org"](https://lmsys.org/blog/2023-03-30-vicuna). *lmsys.org*. 30 March 2023. [Archived](https://web.archive.org/web/20240812055843/https://lmsys.org/blog/2023-03-30-vicuna/) from the original on 2024-08-12. Retrieved 2024-08-11.

[^c1fn85]: Liu, Haotian; Li, Chunyuan; Wu, Qingyang; Lee, Yong Jae (2023-12-15). ["Visual Instruction Tuning"](https://proceedings.neurips.cc/paper_files/paper/2023/hash/6dcf277ea32ce3288914faf369fe6de0-Abstract-Conference.html). *Advances in Neural Information Processing Systems*. Vol. 36. pp. 34892–34916. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.52202/075280-1516](https://doi.org/10.52202%2F075280-1516). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-7138-9911-2](https://en.wikipedia.org/wiki/Special:BookSources/978-1-7138-9911-2 "Special:BookSources/978-1-7138-9911-2"). [Archived](https://web.archive.org/web/20240926183648/https://proceedings.neurips.cc//paper_files/paper/2023/hash/6dcf277ea32ce3288914faf369fe6de0-Abstract-Conference.html) from the original on 2024-09-26. Retrieved 2024-08-11.

[^c1fn86]: Radford, Alec; Kim, Jong Wook; Xu, Tao; Brockman, Greg; McLeavey, Christine; Sutskever, Ilya (2022). "Robust Speech Recognition via Large-Scale Weak Supervision". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2212.04356](https://arxiv.org/abs/2212.04356) [[eess.AS](https://arxiv.org/archive/eess.AS)].

[^c1fn87]: Jaegle, Andrew; Gimeno, Felix; Brock, Andrew; Zisserman, Andrew; Vinyals, Oriol; Carreira, Joao (2021-06-22). "Perceiver: General Perception with Iterative Attention". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2103.03206](https://arxiv.org/abs/2103.03206) [[cs.CV](https://arxiv.org/archive/cs.CV)].

[^c1fn88]: Jaegle, Andrew; Borgeaud, Sebastian; Alayrac, Jean-Baptiste; Doersch, Carl; Ionescu, Catalin; Ding, David; Koppula, Skanda; Zoran, Daniel; Brock, Andrew; Shelhamer, Evan; Hénaff, Olivier (2021-08-02). "Perceiver IO: A General Architecture for Structured Inputs & Outputs". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2107.14795](https://arxiv.org/abs/2107.14795) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c1fn89]: ["Parti: Pathways Autoregressive Text-to-Image Model"](https://sites.research.google/parti/). *sites.research.google*. [Archived](https://web.archive.org/web/20240810094406/https://sites.research.google/parti/) from the original on 2024-08-10. Retrieved 2024-08-09.

[^c1fn90]: Villegas, Ruben; Babaeizadeh, Mohammad; Kindermans, Pieter-Jan; Moraldo, Hernan; Zhang, Han; Saffar, Mohammad Taghi; Castro, Santiago; Kunze, Julius; Erhan, Dumitru (2022-09-29). "Phenaki: Variable Length Video Generation from Open Domain Textual Descriptions". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2210.02399](https://arxiv.org/abs/2210.02399) [[cs.CV](https://arxiv.org/archive/cs.CV)].

[^c1fn91]: Chang, Huiwen; Zhang, Han; Barber, Jarred; Maschinot, A. J.; Lezama, Jose; Jiang, Lu; [Yang, Ming-Hsuan](https://en.wikipedia.org/wiki/Ming-Hsuan_Yang "Ming-Hsuan Yang"); Murphy, Kevin; Freeman, William T. (2023-01-02). "Muse: Text-To-Image Generation via Masked Generative Transformers". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2301.00704](https://arxiv.org/abs/2301.00704) [[cs.CV](https://arxiv.org/archive/cs.CV)].

[^c1fn92]: Ramesh, Aditya; Pavlov, Mikhail; Goh, Gabriel; Gray, Scott; Voss, Chelsea; Radford, Alec; Chen, Mark; Sutskever, Ilya (2021-02-26). "Zero-Shot Text-to-Image Generation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2102.12092](https://arxiv.org/abs/2102.12092) [[cs.CV](https://arxiv.org/archive/cs.CV)].

[^c1fn93]: Yu, Jiahui; Xu, Yuanzhong; Koh, Jing Yu; Luong, Thang; Baid, Gunjan; Wang, Zirui; Vasudevan, Vijay; Ku, Alexander; Yang, Yinfei (2022-06-21). "Scaling Autoregressive Models for Content-Rich Text-to-Image Generation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2206.10789](https://arxiv.org/abs/2206.10789) [[cs.CV](https://arxiv.org/archive/cs.CV)].

[^c1fn94]: Kariampuzha, William; Alyea, Gioconda; Qu, Sue; Sanjak, Jaleal; Mathé, Ewy; Sid, Eric; Chatelaine, Haley; Yadaw, Arjun; Xu, Yanji; Zhu, Qian (2023). ["Precision information extraction for rare disease epidemiology at scale"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9972634). *Journal of Translational Medicine*. **21** (1): 157. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1186/s12967-023-04011-y](https://doi.org/10.1186%2Fs12967-023-04011-y). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [9972634](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9972634). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [36855134](https://pubmed.ncbi.nlm.nih.gov/36855134).

[^c1fn95]: Hsu, Cyril Shih-Huan; Dalgkitsis, Anestis; Grosso, Paola; Papagianni, Chrysa (2026). "Transformer-Empowered Actor-Critic Reinforcement Learning for Sequence-Aware Service Function Chain Partitioning". *IEEE Transactions on Network Science and Engineering*. **13**: 9247–9264. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2504.18902](https://arxiv.org/abs/2504.18902). [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2026ITNSE..13.9247H](https://scixplorer.org/abs/2026ITNSE..13.9247H). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/TNSE.2026.3689920](https://doi.org/10.1109%2FTNSE.2026.3689920).

# Attention (machine learning) {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Attention_(machine_learning)](https://en.wikipedia.org/wiki/Attention_(machine_learning))* | *Author: Wikipedia contributors*
:::

![Attention mechanism, overview](https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Attention_mechanism_overview.svg/250px-Attention_mechanism_overview.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning"), **attention** is a method that determines the importance of, or "attends to", each component in a sequence relative to the other components in that sequence. In [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), importance is represented by weights assigned to each word in a sentence. More generally, attention encodes [vectors](https://en.wikipedia.org/wiki/Vector_%28mathematics_and_physics%29 "Vector (mathematics and physics)") called [token](https://en.wikipedia.org/wiki/Lexical_analysis "Lexical analysis") [embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") across a fixed-width [sequence](https://en.wikipedia.org/wiki/Context_window "Context window") that can range from tens to millions of tokens in size.

Earlier designs implemented the attention mechanism in a serial [recurrent neural network](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network") (RNN) language translation system, but a more recent design, namely the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)"), removed the slower sequential RNN and relied more heavily on the faster parallel attention scheme, which has largely replaced RNN in frontier models since [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)"), [T5](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") and [GPT](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer").

Inspired by ideas about [attention in humans](https://en.wikipedia.org/wiki/Attention "Attention"), the attention mechanism was developed to address the weaknesses of using information from the [hidden layers](https://en.wikipedia.org/wiki/Hidden_layer "Hidden layer") of recurrent neural networks. Recurrent neural networks favor information contained in words at the end of a sentence and thus deemed more recent, thereby tending to [attenuate](https://en.wikipedia.org/wiki/Vanishing_gradient_problem "Vanishing gradient problem") the significance and associated predictive weight assigned to information earlier in the sentence. Attention allows a token equal access to any part of a sentence directly, rather than only through the previous state.

## History

Academic reviews of the history of the attention mechanism are provided in Niu et al.[^c2fn1] and Soydaner.[^c2fn2]

### Predecessors

[Selective attention](https://en.wikipedia.org/wiki/Attentional_control "Attentional control") in humans had been well studied in neuroscience and cognitive psychology.[^c2fn3] In 1953, [Colin Cherry](https://en.wikipedia.org/wiki/Colin_Cherry "Colin Cherry") studied selective attention in the context of audition, known as the [cocktail party effect](https://en.wikipedia.org/wiki/Cocktail_party_effect "Cocktail party effect").[^c2fn4]

In 1958, [Donald Broadbent](https://en.wikipedia.org/wiki/Donald_Broadbent "Donald Broadbent") proposed the [filter model of attention](https://en.wikipedia.org/wiki/Broadbent's_filter_model_of_attention "Broadbent's filter model of attention").[^c2fn5] Selective attention of vision was studied in the 1960s by [George Sperling](https://en.wikipedia.org/wiki/George_Sperling "George Sperling")'s [partial report paradigm](https://en.wikipedia.org/wiki/Iconic_memory#Sperling's_partial_report_procedure "Iconic memory"). It was also noticed that [saccade control](https://en.wikipedia.org/wiki/Saccade "Saccade") is modulated by cognitive processes, insofar as the eye moves preferentially towards areas of high [salience](https://en.wikipedia.org/wiki/Salience_%28neuroscience%29 "Salience (neuroscience)"). As the fovea of the eye is small, the eye cannot sharply resolve the entire visual field at once. The use of saccade control allows the eye to quickly scan important features of a scene.[^c2fn6]

These research developments inspired algorithms such as the [Neocognitron](https://en.wikipedia.org/wiki/Neocognitron "Neocognitron") and its variants.[^c2fn7][^c2fn8] Meanwhile, developments in neural networks had inspired circuit models of biological visual attention.[^c2fn9][^c2fn2] One well-cited network from 1998, for example, was inspired by the [low-level primate visual system](https://en.wikipedia.org/wiki/Visual_cortex "Visual cortex"). It produced [saliency maps](https://en.wikipedia.org/wiki/Saliency_map "Saliency map") of images using handcrafted (not learned) features, which were then used to guide a second neural network in processing patches of the image in order of reducing saliency.[^c2fn10]

A key aspect of attention mechanism can be written (schematically) as $$\sum_i \langle(\text{query})_i, (\text{key})_i\rangle (\text{value})_i$$where the angled brackets denote dot product. This shows that it involves a multiplicative operation. Multiplicative operations within artificial neural networks had been studied under the names of *[higher-order neural networks](https://en.wikipedia.org/wiki/Higher-order_neural_network?action=edit&redlink=1 "Higher-order neural network")*,[^c2fn11] *multiplication units*,[^c2fn12] *sigma-pi units*,[^c2fn13] *fast weight controllers*,[^c2fn14] and *hyper-networks*.[^c2fn15]

In *fast weight controller*, one of its two networks has "fast weights" or "dynamic links" (1981).[^c2fn16][^c2fn17][^c2fn18] A slow neural network learns by gradient descent to generate keys and values for computing the weight changes of the fast neural network which computes answers to queries.[^c2fn14] This is dot-product attention without softmax.[^c2fn19]

### Recurrent attention

During the deep learning era, attention mechanism was developed to solve similar problems in encoding-decoding.[^c2fn1]

In machine translation, the [seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq") model, as it was proposed in 2014,[^c2fn20] would encode an input text into a fixed-length vector, which would then be decoded into an output text. If the input text is long, the fixed-length vector would be unable to carry enough information for accurate decoding. An attention mechanism was proposed to solve this problem.

An image captioning model was proposed in 2015, citing inspiration from the seq2seq model.[^c2fn21] that would encode an input image into a fixed-length vector. (Xu et al 2015),[^c2fn22] citing (Bahdanau et al 2014),[^c2fn23] applied the attention mechanism as used in the seq2seq model to image captioning.

### Transformer

One problem with seq2seq models was their use of recurrent neural networks, which are not parallelizable as both the encoder and the decoder must process the sequence token-by-token. *Decomposable attention[^c2fn24]* attempted to solve this problem by processing the input sequence in parallel, before computing a "soft alignment matrix" (*alignment* is the terminology used by Bahdanau et al[^c2fn23]) in order to allow for parallel processing.

The idea of using the attention mechanism for self-attention, instead of in an encoder-decoder (cross-attention), was also proposed during this period, such as in [differentiable neural computers](https://en.wikipedia.org/wiki/Differentiable_neural_computer "Differentiable neural computer")[^c2fn25] and [neural Turing machines](https://en.wikipedia.org/wiki/Neural_Turing_machine "Neural Turing machine").[^c2fn26] It was termed *intra-attention*[^c2fn27] where an LSTM is augmented with a memory network as it encodes an input sequence.

These strands of development were brought together in 2017 with the [Transformer architecture](https://en.wikipedia.org/wiki/Transformer_architecture "Transformer architecture"), published in the *[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")* paper.[^c2fn28]

## Dot-product attention

![Computing the attention weights by dot-product. This is the "decoder cross-attention".](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Encoder_cross-attention.png/250px-Encoder_cross-attention.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Encoder self-attention, block diagram.](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Encoder_self-attention%2C_block_diagram.png/250px-Encoder_self-attention%2C_block_diagram.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![Cross-attention, block diagram.](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Encoder_cross-attention.png/250px-Encoder_cross-attention.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Given three matrices: $Q\in\mathbb{R}^{m\times d_Q}, K\in\mathbb{R}^{n\times d_K}$ and $V\in\mathbb{R}^{n\times d_V}$, the scaled dot-product attention is defined as:$$\text{Attention}(Q, K, V) = \text{softmax}\left(\lambda QK^T\right)V\in\mathbb{R}^{m\times d_v}$$where ${}^T$ denotes [transpose](https://en.wikipedia.org/wiki/Transpose "Transpose") and the [softmax function](https://en.wikipedia.org/wiki/Softmax_function "Softmax function") is applied independently to every row of its argument. $\lambda$ is a scalar. It is usually set to $1/\sqrt{d_K}$.

The matrix $Q$ contains $m$ queries, while matrices $K, V$ jointly contain $n$ key-value pairs. Value vectors in matrix $V$ are weighted using the weights resulting from the softmax operation, so that the rows of the $m$-by-$d_v$ output matrix are confined to the [convex hull](https://en.wikipedia.org/wiki/Convex_hull "Convex hull") of the points in $\mathbb{R}^{d_v}$ given by the rows of $V$.

Attention mechanism without positional encoding is permutation-invariant.[^c2fn29]

### Masking

![Decoder self-attention with causal masking, detailed diagram](https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Decoder_self-attention_with_causal_masking%2C_detailed_diagram.png/250px-Decoder_self-attention_with_causal_masking%2C_detailed_diagram.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

For decoder self-attention, all-to-all attention is inappropriate, because during the autoregressive decoding process, the decoder cannot attend to future outputs that has yet to be decoded. This can be solved by forcing the attention weights $w_{ij} = 0$ for all $i < j$, called "causal masking". This attention mechanism is the "causally masked self-attention".

Formally,$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}+M\right)V$$where$$M = \begin{bmatrix}
0 & -\infty & -\infty & \dots  & -\infty \\
0 & 0 & -\infty & \dots  & -\infty \\
0 & 0 & 0 & \dots  & -\infty \\
\vdots & \vdots & \vdots & \ddots & \vdots \\
0 & 0 & 0 & \dots  & 0
\end{bmatrix}$$The effect of adding $-\infty$ is to zero out the corresponding attention weight, after applying the softmax.

Other forms of masking are possible, to enforce different types of attention weight patterns.

### Multi-head

![Decoder multiheaded cross-attention](https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d5/Encoder_cross-attention%2C_multiheaded_version.png/250px-Encoder_cross-attention%2C_multiheaded_version.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Several dot-product attention mechanisms can be combined, resulting in the Multi-Head Attention (MHA):$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, ..., \text{head}_h)W^O$$where each head is computed with QKV attention as:$$\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$and $W_i^Q, W_i^K, W_i^V$, and $W^O$ are learnable matrices.

### Self-attention

Self-attention is essentially the same as cross-attention, except that query, key, and value vectors all come from the same model. Both encoder and decoder can use self-attention, but with subtle differences.

For encoder self-attention, we can start with a simple encoder without self-attention, such as an "embedding layer", which simply converts each input word into a vector by a fixed [lookup table](https://en.wikipedia.org/wiki/Lookup_table "Lookup table"). This gives a sequence of hidden vectors $h_0, h_1, \dots$. These can then be applied to a dot-product attention mechanism, to obtain$$\begin{aligned}
h_0' &= \mathrm{Attention}(h_0 W^Q, HW^K, H W^V) \\ 
h_1' &= \mathrm{Attention}(h_1 W^Q, HW^K, H W^V) \\
&\;\,\vdots
\end{aligned}$$or more succinctly, $H' = \mathrm{Attention}(H W^Q, HW^K, H W^V)$. This can be applied repeatedly, to obtain a multilayered encoder. This is the "encoder self-attention", sometimes called the "all-to-all attention", as the vector at every position can attend to every other.

![Comparison of the data flow in CNN, RNN, and self-attention](https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d7/Self-attention_in_CNN%2C_RNN%2C_and_self-attention.svg/250px-Self-attention_in_CNN%2C_RNN%2C_and_self-attention.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

### Historical variants

[Lernmatrix](https://en.wikipedia.org/wiki/Lernmatrix "Lernmatrix"),[^c2fn30] or correlation matrix memory,[^c2fn31] or [linear attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29#Linear_attention), is dot-product attention, with causal masking, without softmax.

Bahdanau et al (2014) proposed an additive form of attention[^c2fn32]$$z_{ij} = \tanh(q_i W^Q + k_j W^K) w^T$$where $W^Q, W^K$ are learnable matrices, and $w$ is a learnable vector.

Luong et al (2015) attempted to improve upon Bahdanau et al (2014). They tested at least two different forms of attentions, two of which are the modern form of dot-product attention.[^c2fn33] They worked on seq2seq machine translation. A multilayered LSTM processes an input sequence $x_1, \dots, x_n$ (such as a sequence of words in an English sequence) into a sequence of vectors $k_1, \dots, k_n$. It then receives a special token `<EOS>` ("end of sequence") to mark as $x_0'$, the beginning of the output sequence. It then proceeds as follows:

- Given another output $x_i'$, run the LSTM for another step, obtaining output $q_i$.
- $q_i$ pays attention to input key-value pairs. The key and value vectors are the same: $k_i = v_i$.
- The attention scores $z_{ij}$ are calculated as either $z_{ij} = q_i W k_j^T$, as in modern dot-product attention, or as $z_{ij} = \tanh(q_i W^Q + k_j W^K) w^T$, as in Bahdanau et al (2014).
- The output vector is $o_i = \frac{1}{\sum_{j \leq i} e^{z_{ij}} } \sum_{j \leq i} e^{z_{ij}} v_j$.
- The output word is sampled from $\operatorname{softmax}(\tanh(o_i W^Q + q_i W^Q) W)$.

## Linear attention

Consider a sequence of length $L$. The dot-product softmax attention mechanism costs $O(L^2)$ to process the entire sequence. After that, the attention mechanism needs another $O(L)$ to process each new token. Consequently, many variants have been proposed to save the cost.

### Correlation matrix memory

Removing the softmax results in the [Lernmatrix](https://en.wikipedia.org/wiki/Lernmatrix "Lernmatrix"),[^c2fn30] or correlation matrix memory.[^c2fn31] In the standard causally masked dot-product attention mechanism, the input sequence of vectors $x_1, x_2, \dots$ are converted to a triple sequence of query-key-value vectors $q_i = W^Q x_i, k_i = W^K x_i, v_i = W^V x_i$ via matrices $W^Q, W^K, W^V$, and the *t*-th output vector is $o_t = \sum_{i \leq t}\frac{e^{q_t k_i^T}}{\sum_{j \leq t} e^{q_t k_j^T}} v_i$.

A naive linear attention mechanism is to take off the softmax: $o_t = q_t \left(\sum_{i \leq t} k_i^T v_i \right)$. The thing in the brackets is a **memory matrix** $M_t$, such that $o_t = q_t M_t$, and the memory updates via $M_{t} = M_{t-1} + k_t^T v_t$.

### Kernel method

The main difference between correlation matrix memory and dot-product attention is that neither the exponential sum $\sum_{j \leq t} e^{q_t k_j^T}$ nor the exponentially-weighted sum $\sum_{i \leq t}{e^{q_t k_i^T} v_i}$ is a matrix product. This can be converted to a correlation matrix memory by using the [kernel method](https://en.wikipedia.org/wiki/Kernel_trick "Kernel trick").[^c2fn34]

Specifically, define the function $K(q, k) := e^{q k^T}$. It is a [kernel function](https://en.wikipedia.org/wiki/Positive-definite_kernel "Positive-definite kernel"), so it can be reproduced as the inner product in a Hilbert space $H$ (the [Reproducing Kernel Hilbert Space](https://en.wikipedia.org/wiki/Reproducing_kernel_Hilbert_space "Reproducing kernel Hilbert space")) . Let $\phi : \R^{d_K} \to H$ be the feature function, then $K(q, k) = \phi(q) \phi(k)^T$, and both sums factor:$$o_t = \frac{\phi(q_t) M_t }{\phi(q_t) m_t^T}, \quad 
M_t := \sum_{i \leq t} \phi(k_i)^T v_i, \;
m_t := \sum_{i \leq t} \phi(k_i)$$Since both $M_t, m_t$ are iteratively updated, computing a new token takes $O(1)$ time and $O(1)$ space, and computing the full length-$L$ sequence takes $O(N)$ time and $O(1)$ space.

The main issue is that $\phi$ has infinitely many dimensions. Nevertheless, it can be approximated in finitely many dimensions. That is, there exists $\tilde \phi: \R^{d_K} \to \R^N$ for some $N$ such that $K(q, k) \approx \tilde\phi(q) \tilde\phi(k)^T$. Since $K$ is just a scared version of the [RBF kernel](https://en.wikipedia.org/wiki/Radial_basis_function_kernel "Radial basis function kernel"), and the RBF kernel has been studied extensively, there are many approximations to choose from.

#### Random Fourier features

A particular choice uses [random Fourier features](https://en.wikipedia.org/wiki/Random_Fourier_feature "Random Fourier feature") of the RBF,[^c2fn35] which uses the exact identity $$e^{\| x - y\|^2/\sigma^2} = \mathbb E_{w \sim \mathcal N(0, \sigma^2 I)}[
\cos \langle w,x\rangle\cos \langle w,y\rangle + 
\sin \langle w,x\rangle\sin \langle w,y\rangle]$$where $\mathcal N$ is the [normal distribution](https://en.wikipedia.org/wiki/Normal_distribution "Normal distribution"). Consequently, by taking finitely many samples of $w_1, \dots, w_D, \sim \mathcal N(0, \sigma^2 I)$, we have$$e^{\langle x, y\rangle/\sigma^2} \approx \langle e^{\|x\|^2/2\sigma^2} \varphi(x), e^{\|y\|^2/2\sigma^2}\varphi(y)\rangle, 
\quad
\varphi(x) = \frac{1}{\sqrt D}[\cos\langle w_1, x\rangle, \sin\langle w_1, x\rangle, \cdots \cos\langle w_D, x\rangle, \sin\langle w_D, x\rangle]^T$$Random Fourier features may have negative entries, but the RBF kernel is always positive.

#### Performer

Performer (2020)[^c2fn36] improves on it by exploiting two other identities:$$\mathbb E_{w\sim \mathcal N (0, I)} [e^{\langle w, x \rangle -\| x \|^2/2}e^{\langle w, x \rangle -\| x \|^2/2}]
=
\frac 12 e^{-\frac{\|x\|^2 + \|y\|^2}{2}} 
\mathbb E_{w\sim \mathcal (0, I)} [
e^{\langle w, x \rangle}e^{\langle w, y \rangle} + 
e^{-\langle w, x \rangle}e^{-\langle w, y \rangle}]$$These give two random feature maps. In either one, all features are positive. It also samples $w_1, ..., w_D$ by orthogonal random features,[^c2fn37] a [low-discrepancy method](https://en.wikipedia.org/wiki/Quasi-Monte_Carlo_method "Quasi-Monte Carlo method"). They are first independently sampled from the normal distribution $N(0, \sigma^2 I)$, then orthogonalized by [Gram–Schmidt process](https://en.wikipedia.org/wiki/Gram–Schmidt_process "Gram–Schmidt process"), then scaled to a length according to the [chi-squared distribution](https://en.wikipedia.org/wiki/Chi-squared_distribution "Chi-squared distribution") $\chi^2(d)$. If $D > d$, then this process is repeated for $D/d$ times, generating up to $d$ vectors at each generation until $D$ vectors are generated.

### DeltaNet

In **DeltaNet**, a form of forgetting is implemented, by subtraction. Beginning with the memory matrix update $M_{t} = M_{t-1} + k_t^T v_t$, forgetting is implemented by the following modification:[^c2fn38]$$M_{t} = M_{t-1} + \eta_t k_t^T (v_t - k_t M_{t-1})$$where $\eta_t$ describes how much the memory matrix updates. At one limit, $\eta_t=0$, and $M_t = M_{t-1}$. At the other limit, $\eta_t = 1$, and $M_t = k_t^T v_t + (I - k_t^T k_t) M_{t-1}$, which satisfies $k_t M_t = v_t$ when $k_t$ is a unit vector.

In DeltaNet, $\eta$ is computed by a linear-sigmoid layer. That is, $\eta_t = \sigma(x_t w^T + b)$, where $w$ is a learnable weight vector, $b$ is a learnable bias, and $\sigma$ is a sigmoid [activation function](https://en.wikipedia.org/wiki/Activation_function "Activation function"), usually the [logistic function](https://en.wikipedia.org/wiki/Logistic_function "Logistic function").

## Optimizations

### Flash attention

The size of the attention matrix is proportional to the square of the number of input tokens. Therefore, when the input is long, calculating the attention matrix requires a lot of [GPU](https://en.wikipedia.org/wiki/GPU "GPU") memory. Flash attention is an implementation that reduces the memory needs and increases efficiency without sacrificing accuracy. It achieves this by partitioning the attention computation into smaller blocks that fit into the GPU's faster on-chip memory, reducing the need to store large intermediate matrices and thus lowering memory usage while increasing computational efficiency.[^c2fn39]

### KV cache

## Applications

Attention is widely used in [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), [computer vision](https://en.wikipedia.org/wiki/Computer_vision "Computer vision"), and [speech recognition](https://en.wikipedia.org/wiki/Speech_recognition "Speech recognition"). In natural language processing, it improves context understanding in tasks like question answering and summarization. In vision, visual attention helps models focus on relevant image regions, enhancing object detection and image captioning.

### Attention maps as explanations for vision transformers

From the original paper on [vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer") (ViT), visualizing attention scores as a heat map (called [saliency maps](https://en.wikipedia.org/wiki/Saliency_map "Saliency map") or attention maps) has become an important and routine way to inspect the decision making process of ViT models.[^c2fn40] One can compute the attention maps with respect to any attention head at any layer, while the deeper layers tend to show more semantically meaningful visualization. Attention rollout is a recursive algorithm to combine attention scores across all layers, by computing the dot product of successive attention maps.[^c2fn41]

Because vision transformers are typically trained in a [self-supervised](https://en.wikipedia.org/wiki/Self-supervised_learning "Self-supervised learning") manner, attention maps are generally not class-sensitive. When a classification head is attached to the ViT backbone, class-discriminative attention maps (CDAM) combines attention maps and gradients with respect to the class `[CLS]` token.[^c2fn42] Some class-sensitive [interpretability](https://en.wikipedia.org/wiki/Explainable_artificial_intelligence "Explainable artificial intelligence") methods originally developed for [convolutional neural networks](https://en.wikipedia.org/wiki/Convolutional_neural_network "Convolutional neural network") can be also applied to ViT, such as GradCAM, which [back-propagates](https://en.wikipedia.org/wiki/Backpropagation "Backpropagation") the gradients to the outputs of the final attention layer.[^c2fn43]

Using attention as basis of explanation for the transformers in language and vision is not without debate. While some pioneering papers analyzed and framed attention scores as explanations,[^c2fn44][^c2fn45] higher attention scores do not always correlate with greater impact on model performances.[^c2fn46]

[^c2fn1]: Niu, Zhaoyang; Zhong, Guoqiang; Yu, Hui (2021-09-10). ["A review on the attention mechanism of deep learning"](https://www.sciencedirect.com/science/article/pii/S092523122100477X). *Neurocomputing*. **452**: 48–62. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/j.neucom.2021.03.091](https://doi.org/10.1016%2Fj.neucom.2021.03.091). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0925-2312](https://search.worldcat.org/issn/0925-2312).

[^c2fn2]: Soydaner, Derya (August 2022). ["Attention mechanism in neural networks: where it comes and where it goes"](https://link.springer.com/10.1007/s00521-022-07366-3). *Neural Computing and Applications*. **34** (16): 13371–13385. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2204.13154](https://arxiv.org/abs/2204.13154). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/s00521-022-07366-3](https://doi.org/10.1007%2Fs00521-022-07366-3). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0941-0643](https://search.worldcat.org/issn/0941-0643).

[^c2fn3]: Kramer, Arthur F.; Wiegmann, Douglas A.; Kirlik, Alex (2006-12-28). "1 Attention: From History to Application". [*Attention: From Theory to Practice*](http://www.oxfordscholarship.com/view/10.1093/acprof:oso/9780195305722.001.0001/acprof-9780195305722). Oxford University Press. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1093/acprof:oso/9780195305722.003.0001](https://doi.org/10.1093%2Facprof%3Aoso%2F9780195305722.003.0001). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-0-19-530572-2](https://en.wikipedia.org/wiki/Special:BookSources/978-0-19-530572-2 "Special:BookSources/978-0-19-530572-2").

[^c2fn4]: Cherry, E. Colin (1953). "Some Experiments on the Recognition of Speech, with One and with Two Ears". *The Journal of the Acoustical Society of America*. **25** (5): 975–979. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[1953ASAJ...25..975C](https://scixplorer.org/abs/1953ASAJ...25..975C). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1121/1.1907229](https://doi.org/10.1121%2F1.1907229). [hdl](https://en.wikipedia.org/wiki/Hdl_%28identifier%29 "Hdl (identifier)"):[11858/00-001M-0000-002A-F750-3](https://hdl.handle.net/11858%2F00-001M-0000-002A-F750-3).

[^c2fn5]: Broadbent, Donald E. (1958). *Perception and Communication*. Pergamon Press.

[^c2fn6]: Kowler, Eileen; Anderson, Eric; Dosher, Barbara; Blaser, Erik (1995-07-01). ["The role of attention in the programming of saccades"](https://dx.doi.org/10.1016/0042-6989%2894%2900279-U). *Vision Research*. **35** (13): 1897–1916. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/0042-6989(94)00279-U](https://doi.org/10.1016%2F0042-6989%2894%2900279-U). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0042-6989](https://search.worldcat.org/issn/0042-6989). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [7660596](https://pubmed.ncbi.nlm.nih.gov/7660596).

[^c2fn7]: Fukushima, Kunihiko (1987-12-01). ["Neural network model for selective attention in visual pattern recognition and associative recall"](https://opg.optica.org/abstract.cfm?URI=ao-26-23-4985). *Applied Optics*. **26** (23): 4985–4992. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[1987ApOpt..26.4985F](https://scixplorer.org/abs/1987ApOpt..26.4985F). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1364/AO.26.004985](https://doi.org/10.1364%2FAO.26.004985). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0003-6935](https://search.worldcat.org/issn/0003-6935). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [20523477](https://pubmed.ncbi.nlm.nih.gov/20523477).

[^c2fn8]: Ba, Jimmy; Mnih, Volodymyr; Kavukcuoglu, Koray (2015-04-23). "Multiple Object Recognition with Visual Attention". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1412.7755](https://arxiv.org/abs/1412.7755) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c2fn9]: Koch, Christof; Ullman, Shimon (1987). ["Shifts in Selective Visual Attention: Towards the Underlying Neural Circuitry"](https://doi.org/10.1007/978-94-009-3833-5_5). In Vaina, Lucia M. (ed.). *Matters of Intelligence: Conceptual Structures in Cognitive Neuroscience*. Dordrecht: Springer Netherlands. pp. 115–141. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/978-94-009-3833-5\_5](https://doi.org/10.1007%2F978-94-009-3833-5_5). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-94-009-3833-5](https://en.wikipedia.org/wiki/Special:BookSources/978-94-009-3833-5 "Special:BookSources/978-94-009-3833-5"). Retrieved 2024-08-06.

[^c2fn10]: Itti, L.; Koch, C.; Niebur, E. (November 1998). ["A model of saliency-based visual attention for rapid scene analysis"](https://ieeexplore.ieee.org/document/730558). *IEEE Transactions on Pattern Analysis and Machine Intelligence*. **20** (11): 1254–1259. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/34.730558](https://doi.org/10.1109%2F34.730558).

[^c2fn11]: Giles, C. Lee; Maxwell, Tom (1987-12-01). ["Learning, invariance, and generalization in high-order neural networks"](https://opg.optica.org/abstract.cfm?URI=ao-26-23-4972). *Applied Optics*. **26** (23): 4972–4978. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1364/AO.26.004972](https://doi.org/10.1364%2FAO.26.004972). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0003-6935](https://search.worldcat.org/issn/0003-6935). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [20523475](https://pubmed.ncbi.nlm.nih.gov/20523475).

[^c2fn12]: Feldman, J. A.; Ballard, D. H. (1982-07-01). ["Connectionist models and their properties"](https://www.sciencedirect.com/science/article/pii/S0364021382800013). *Cognitive Science*. **6** (3): 205–254. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/S0364-0213(82)80001-3](https://doi.org/10.1016%2FS0364-0213%2882%2980001-3). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0364-0213](https://search.worldcat.org/issn/0364-0213).

[^c2fn13]: Rumelhart, David E.; Hinton, G. E.; Mcclelland, James L. (1987-07-29). ["A General Framework for Parallel Distributed Processing"](https://stanford.edu/~jlmcc/papers/PDP/Chapter2.pdf) (PDF). In Rumelhart, David E.; Hinton, G. E.; PDP Research Group (eds.). *Parallel Distributed Processing, Volume 1: Explorations in the Microstructure of Cognition: Foundations*. Cambridge, Massachusetts: MIT Press. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-0-262-68053-0](https://en.wikipedia.org/wiki/Special:BookSources/978-0-262-68053-0 "Special:BookSources/978-0-262-68053-0").

[^c2fn14]: [Schmidhuber, Jürgen](https://en.wikipedia.org/wiki/Jürgen_Schmidhuber "Jürgen Schmidhuber") (1992). "Learning to control fast-weight memories: an alternative to recurrent nets". *Neural Computation*. **4** (1): 131–139. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/neco.1992.4.1.131](https://doi.org/10.1162%2Fneco.1992.4.1.131). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [16683347](https://api.semanticscholar.org/CorpusID:16683347).

[^c2fn15]: Ha, David; Dai, Andrew; Le, Quoc V. (2016-12-01). "HyperNetworks". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1609.09106](https://arxiv.org/abs/1609.09106) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c2fn16]: von der Malsburg, Christoph (1981). "The correlation theory of brain function". *Internal Report 81–2, Max-Planck-Institute for Biophysical Chemistry*.

[^c2fn17]: Feldman, Jerome A. (1982). "Dynamic connections in neural networks". *Biological Cybernetics*. **46** (1): 27–39. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/BF00335349](https://doi.org/10.1007%2FBF00335349). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [6307398](https://pubmed.ncbi.nlm.nih.gov/6307398).

[^c2fn18]: Hinton, Geoffrey E.; Plaut, David C. (1987). ["Using Fast Weights to Deblur Old Memories"](https://escholarship.org/uc/item/0570j1dp). *Proceedings of the Annual Meeting of the Cognitive Science Society*. **9**.

[^c2fn19]: [Schlag, Imanol](https://en.wikipedia.org/wiki/Juergen_Schmidhuber "Juergen Schmidhuber"); Irie, Kazuki; Schmidhuber, Jürgen (2021). "Linear Transformers Are Secretly Fast Weight Programmers". *ICML 2021*. Springer. pp. 9355–9366.

[^c2fn20]: Sutskever, Ilya; Vinyals, Oriol; Le, Quoc Viet (2014). "Sequence to sequence learning with neural networks". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.3215](https://arxiv.org/abs/1409.3215) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn21]: Vinyals, Oriol; Toshev, Alexander; Bengio, Samy; Erhan, Dumitru (2015). ["Show and Tell: A Neural Image Caption Generator"](https://www.cv-foundation.org/openaccess/content_cvpr_2015/html/Vinyals_Show_and_Tell_2015_CVPR_paper.html). pp. 3156–3164.

[^c2fn22]: Xu, Kelvin; Ba, Jimmy; Kiros, Ryan; Cho, Kyunghyun; Courville, Aaron; Salakhudinov, Ruslan; Zemel, Rich; Bengio, Yoshua (2015-06-01). ["Show, Attend and Tell: Neural Image Caption Generation with Visual Attention"](https://proceedings.mlr.press/v37/xuc15.html). *Proceedings of the 32nd International Conference on Machine Learning*. PMLR: 2048–2057.

[^c2fn23]: Bahdanau, Dzmitry; Cho, Kyunghyun; Bengio, Yoshua (19 May 2016). "Neural Machine Translation by Jointly Learning to Align and Translate". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.0473](https://arxiv.org/abs/1409.0473) [[cs.CL](https://arxiv.org/archive/cs.CL)]. (orig-date 1 Sep 2014)

[^c2fn24]: Parikh, Ankur; Täckström, Oscar; Das, Dipanjan; Uszkoreit, Jakob (2016). ["A Decomposable Attention Model for Natural Language Inference"](https://dx.doi.org/10.18653/v1/d16-1244). *Proceedings of the 2016 Conference on Empirical Methods in Natural Language Processing*. Stroudsburg, PA, USA: Association for Computational Linguistics. pp. 2249–2255. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1606.01933](https://arxiv.org/abs/1606.01933). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/d16-1244](https://doi.org/10.18653%2Fv1%2Fd16-1244).

[^c2fn25]: Graves, Alex; Wayne, Greg; Reynolds, Malcolm; Harley, Tim; Danihelka, Ivo; Grabska-Barwińska, Agnieszka; Colmenarejo, Sergio Gómez; Grefenstette, Edward; Ramalho, Tiago; Agapiou, John; Badia, Adrià Puigdomènech; Hermann, Karl Moritz; Zwols, Yori; Ostrovski, Georg; Cain, Adam; King, Helen; Summerfield, Christopher; Blunsom, Phil; Kavukcuoglu, Koray; Hassabis, Demis (2016-10-12). ["Hybrid computing using a neural network with dynamic external memory"](https://ora.ox.ac.uk/objects/uuid:dd8473bd-2d70-424d-881b-86d9c9c66b51). *Nature*. **538** (7626): 471–476. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2016Natur.538..471G](https://scixplorer.org/abs/2016Natur.538..471G). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/nature20101](https://doi.org/10.1038%2Fnature20101). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [1476-4687](https://search.worldcat.org/issn/1476-4687). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [27732574](https://pubmed.ncbi.nlm.nih.gov/27732574). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [205251479](https://api.semanticscholar.org/CorpusID:205251479).

[^c2fn26]: Graves, Alex; Wayne, Greg; Danihelka, Ivo (2014-12-10). "Neural Turing Machines". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1410.5401](https://arxiv.org/abs/1410.5401) [[cs.NE](https://arxiv.org/archive/cs.NE)].

[^c2fn27]: Cheng, Jianpeng; Dong, Li; Lapata, Mirella (2016-09-20). "Long Short-Term Memory-Networks for Machine Reading". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1601.06733](https://arxiv.org/abs/1601.06733) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn28]: Vaswani, Ashish; Shazeer, Noam; Parmar, Niki; Uszkoreit, Jakob; Jones, Llion; Gomez, Aidan N.; Kaiser, Lukasz; Polosukhin, Illia (2017). "Attention is All You Need". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1706.03762](https://arxiv.org/abs/1706.03762) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn29]: Lee, Juho; Lee, Yoonho; Kim, Jungtaek; Kosiorek, Adam R; Choi, Seungjin; Teh, Yee Whye (2018). "Set Transformer: A Framework for Attention-based Permutation-Invariant Neural Networks". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1810.00825](https://arxiv.org/abs/1810.00825) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c2fn30]: Steinbuch, K. (1961-01-01). ["Die Lernmatrix"](https://doi.org/10.1007/BF00293853). *Kybernetik*. **1** (1): 36–45. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/BF00293853](https://doi.org/10.1007%2FBF00293853). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [1432-0770](https://search.worldcat.org/issn/1432-0770).

[^c2fn31]: Kohonen, Teuvo (1972-04). ["Correlation Matrix Memories"](http://ieeexplore.ieee.org/document/5008975/). *IEEE Transactions on Computers*. **C-21** (4): 353–359. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/TC.1972.5008975](https://doi.org/10.1109%2FTC.1972.5008975). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0018-9340](https://search.worldcat.org/issn/0018-9340). `{{cite journal}}`: Check date values in: `|date=` ([help](https://en.wikipedia.org/wiki/Help:CS1_errors#bad_date "Help:CS1 errors"))

[^c2fn32]: Bahdanau, Dzmitry; Cho, Kyunghyun; Bengio, Yoshua (2014). "Neural Machine Translation by Jointly Learning to Align and Translate". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.0473](https://arxiv.org/abs/1409.0473) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn33]: Luong, Minh-Thang (2015-09-20). "Effective Approaches to Attention-Based Neural Machine Translation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1508.04025v5](https://arxiv.org/abs/1508.04025v5) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn34]: Katharopoulos, Angelos; Vyas, Apoorv; Pappas, Nikolaos; Fleuret, François (2020-11-21). ["Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention"](https://proceedings.mlr.press/v119/katharopoulos20a.html). *Proceedings of the 37th International Conference on Machine Learning*. PMLR: 5156–5165. [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2640-3498](https://search.worldcat.org/issn/2640-3498).

[^c2fn35]: Peng, Hao; Pappas, Nikolaos; Yogatama, Dani; Schwartz, Roy; Smith, Noah A.; Kong, Lingpeng (2021-03-19). "Random Feature Attention". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2103.02143](https://arxiv.org/abs/2103.02143) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c2fn36]: Choromanski, Krzysztof; Likhosherstov, Valerii; Dohan, David; Song, Xingyou; Gane, Andreea; Sarlos, Tamas; Hawkins, Peter; Davis, Jared; Mohiuddin, Afroz; Kaiser, Lukasz; Belanger, David; Colwell, Lucy; Weller, Adrian (2020-09-30). "Rethinking Attention with Performers". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2009.14794](https://arxiv.org/abs/2009.14794) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c2fn37]: Choromanski, Krzysztof M; Rowland, Mark; Weller, Adrian (2017). ["The Unreasonable Effectiveness of Structured Random Orthogonal Embeddings"](https://proceedings.neurips.cc/paper_files/paper/2017/hash/bf8229696f7a3bb4700cfddef19fa23f-Abstract.html). *Advances in Neural Information Processing Systems*. **30**. Curran Associates, Inc.

[^c2fn38]: Schlag, Imanol; Irie, Kazuki; Schmidhuber, Jürgen (2021-07-01). ["Linear Transformers Are Secretly Fast Weight Programmers"](https://proceedings.mlr.press/v139/schlag21a.html). *Proceedings of the 38th International Conference on Machine Learning*. PMLR: 9355–9366. [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2640-3498](https://search.worldcat.org/issn/2640-3498).

[^c2fn39]: Mittal, Aayush (2024-07-17). ["Flash Attention: Revolutionizing Transformer Efficiency"](https://www.unite.ai/flash-attention-revolutionizing-transformer-efficiency/). *Unite.AI*. Retrieved 2024-11-16.

[^c2fn40]: Dosovitskiy, Alexey; Beyer, Lucas; Kolesnikov, Alexander; Weissenborn, Dirk; Zhai, Xiaohua; Unterthiner, Thomas; Dehghani, Mostafa; Minderer, Matthias; Heigold, Georg (2021-06-03), *An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2010.11929](https://arxiv.org/abs/2010.11929)

[^c2fn41]: Abnar, Samira; Zuidema, Willem (2020-05-31), *Quantifying Attention Flow in Transformers*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2005.00928](https://arxiv.org/abs/2005.00928)

[^c2fn42]: Brocki, Lennart; Binda, Jakub; Chung, Neo Christopher (2024-10-25), *Class-Discriminative Attention Maps for Vision Transformers*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2312.02364](https://arxiv.org/abs/2312.02364)

[^c2fn43]: Gildenblat, Jacob (2025-07-21), [*jacobgil/pytorch-grad-cam*](https://github.com/jacobgil/pytorch-grad-cam), retrieved 2025-07-21

[^c2fn44]: Mullenbach, James; Wiegreffe, Sarah; Duke, Jon; Sun, Jimeng; Eisenstein, Jacob (2018-04-16), *Explainable Prediction of Medical Codes from Clinical Text*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1802.05695](https://arxiv.org/abs/1802.05695)

[^c2fn45]: Bahdanau, Dzmitry; Cho, Kyunghyun; Bengio, Yoshua (2016-05-19), *Neural Machine Translation by Jointly Learning to Align and Translate*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.0473](https://arxiv.org/abs/1409.0473)

[^c2fn46]: Serrano, Sofia; Smith, Noah A. (2019-06-09), *Is Attention Interpretable?*, [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1906.03731](https://arxiv.org/abs/1906.03731)

# Large language model {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Large_language_model](https://en.wikipedia.org/wiki/Large_language_model)* | *Author: Wikipedia contributors*
:::

![The number of publications about large language models by year grouped by publication types](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/The_number_of_publications_about_Large_Language_Models_by_year.png/250px-The_number_of_publications_about_Large_Language_Models_by_year.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

A **large language model** (**LLM**) is a [machine learning model](https://en.wikipedia.org/wiki/Machine_learning#Models "Machine learning") (typically a [neural network](https://en.wikipedia.org/wiki/Neural_network_%28machine_learning%29 "Neural network (machine learning)")) trained on a vast amount of text for [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") tasks, especially [language generation](https://en.wikipedia.org/wiki/Language_generation "Language generation"). LLMs can typically generate, summarize, translate, and analyze text in many contexts.[^c3fn1] They are the basis for many modern [chatbots](https://en.wikipedia.org/wiki/Chatbot "Chatbot"), such as [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT"), [Claude](https://en.wikipedia.org/wiki/Claude_%28AI%29 "Claude (AI)"), [Vibe](https://en.wikipedia.org/wiki/Mistral_Vibe "Mistral Vibe"), [Gemini](https://en.wikipedia.org/wiki/Google_Gemini "Google Gemini"), [Grok](https://en.wikipedia.org/wiki/Grok_%28chatbot%29 "Grok (chatbot)"), [Qwen](https://en.wikipedia.org/wiki/Qwen "Qwen") and [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek_%28chatbot%29 "DeepSeek (chatbot)").

LLMs are typically based on the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)") neural network architecture.[^c3fn2] [Generative pre-trained transformers](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") (GPTs) are a type of LLM that is pre-trained to predict the next word.[^c3fn3] GPTs are then often [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)") to follow instructions and to behave as assistants.[^c3fn4]

Biased or inaccurate training data can make an LLM's output less reliable. A [software harness](https://en.wikipedia.org/wiki/Agent_harness "Agent harness") can provide LLMs with memory and access to tools such as web search. [Benchmark](https://en.wikipedia.org/wiki/Language_model_benchmark "Language model benchmark") evaluations for LLMs attempt to measure [model reasoning](https://en.wikipedia.org/wiki/Reasoning_model "Reasoning model"), factual accuracy, [alignment](https://en.wikipedia.org/wiki/AI_alignment "AI alignment"), and [safety](https://en.wikipedia.org/wiki/AI_safety "AI safety").

## History

![The [training](https://en.wikipedia.org/wiki/AI_training "AI training") [compute](https://en.wikipedia.org/wiki/Compute_%28machine_learning%29 "Compute (machine learning)") of notable large models in FLOPs vs publication date over the period 2010–2024. For overall notable models (top left), frontier models (top right), top language models (bottom left) and top models within leading companies (bottom right). The majority of these models are language models.](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/Trends_in_AI_training_FLOP_over_time_%282010-2025%29.svg/250px-Trends_in_AI_training_FLOP_over_time_%282010-2025%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![The training compute of notable large AI models in FLOPs vs publication date over the period 2017–2024. The majority of large models are language models or multimodal models with language capacity.](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Large-scale_AI_training_compute_%28FLOP%29_vs_Publication_date_%282017-2024%29.svg/250px-Large-scale_AI_training_compute_%28FLOP%29_vs_Publication_date_%282017-2024%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Before the emergence of [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)")-based models in 2017, some [language models](https://en.wikipedia.org/wiki/Language_model "Language model") were considered large relative to the computational and data constraints of their time. In the early 1990s, [IBM](https://en.wikipedia.org/wiki/IBM "IBM")'s [statistical models](https://en.wikipedia.org/wiki/Statistical_model "Statistical model") pioneered [word alignment](https://en.wikipedia.org/wiki/Bitext_word_alignment "Bitext word alignment") techniques for machine translation, laying the groundwork for [corpus-based language modeling](https://en.wikipedia.org/wiki/Construction_grammar "Construction grammar"). In 2001, a smoothed [*n*-gram model](https://en.wikipedia.org/wiki/Word_n-gram_language_model "Word n-gram language model"), such as those employing [Kneser–Ney smoothing](https://en.wikipedia.org/wiki/Kneser–Ney_smoothing "Kneser–Ney smoothing"), trained on 300 million words, achieved state-of-the-art [perplexity](https://en.wikipedia.org/wiki/Perplexity "Perplexity") on benchmark tests.[^c3fn5] During the 2000s, with the rise of widespread [internet access](https://en.wikipedia.org/wiki/Internet_access "Internet access"), researchers began compiling massive text datasets from the web ("web as corpus"[^c3fn6]) to train statistical language models.[^c3fn7][^c3fn8]

Moving beyond *n*-gram models, researchers started in 2000 to use neural networks as language models.[^c3fn9] Following the breakthrough of [deep neural networks](https://en.wikipedia.org/wiki/Deep_learning "Deep learning") in [image classification](https://en.wikipedia.org/wiki/Computer_vision "Computer vision") around 2012,[^c3fn10] similar architectures were adapted for language tasks. This shift was marked by the development of [word embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") (e.g., [Word2Vec](https://en.wikipedia.org/wiki/Word2vec "Word2vec") by [Mikolov](https://en.wikipedia.org/wiki/Tomáš_Mikolov "Tomáš Mikolov") in 2013) and sequence-to-sequence ([seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq")) models using [LSTM](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory"). In 2016, Google transitioned its translation service to [neural machine translation](https://en.wikipedia.org/wiki/Neural_machine_translation "Neural machine translation") (NMT), replacing statistical phrase-based models with deep [recurrent neural networks](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network"). These early NMT systems used LSTM-based [encoder-decoder architectures](https://en.wikipedia.org/wiki/Encoder-decoder_model "Encoder-decoder model"), as they preceded the invention of [transformers](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29 "Transformer (deep learning architecture)").

![An illustration of the main components of the transformer model from the original paper, where layers were normalized after (instead of before) multiheaded attention](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/The-Transformer-model-architecture.png/330px-The-Transformer-model-architecture.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

At the 2017 [NeurIPS](https://en.wikipedia.org/wiki/NeurIPS "NeurIPS") conference, [Google](https://en.wikipedia.org/wiki/Google "Google") researchers introduced the transformer architecture in their landmark paper "[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")".[^c3fn11] This paper's goal was to improve upon 2014 seq2seq technology, and was based mainly on the [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism developed by Bahdanau et al. in 2014.[^c3fn12][^c3fn13] The following year in 2018, [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") was introduced and quickly became "ubiquitous".[^c3fn14] Though the original transformer has both encoder and decoder blocks, BERT is an encoder-only model. Academic and research usage of BERT began to decline in 2023, following rapid improvements in the abilities of decoder-only models (such as GPT) to solve tasks via [prompting](https://en.wikipedia.org/wiki/Prompt_engineering "Prompt engineering").[^c3fn15]

Although decoder-only [GPT-1](https://en.wikipedia.org/wiki/GPT-1 "GPT-1") was introduced in 2018, it was [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2") in 2019 that caught widespread attention because [OpenAI](https://en.wikipedia.org/wiki/OpenAI "OpenAI") claimed to have initially deemed it too powerful to release publicly, out of fear of malicious use.[^c3fn16] [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") in 2020 went a step further and as of 2025 is available only via [API](https://en.wikipedia.org/wiki/Web_API "Web API") with no offering of downloading the model to execute locally. But it was the consumer-facing chatbot [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT") in late 2022 that received extensive media coverage and public attention by 2023.[^c3fn17] The 2023 [GPT-4](https://en.wikipedia.org/wiki/GPT-4 "GPT-4") was praised for its increased accuracy and as a "holy grail" for its [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning") capabilities.[^c3fn18] OpenAI did not reveal the high-level architecture and the number of [parameters](https://en.wikipedia.org/wiki/Parameter#Artificial_intelligence "Parameter") of GPT-4. The release of ChatGPT led to an uptick in LLM usage across several research subfields of computer science, including robotics, software engineering, and societal impact work.[^c3fn15] In 2024, OpenAI released the [reasoning model](https://en.wikipedia.org/wiki/Reasoning_language_model "Reasoning language model") [OpenAI o1](https://en.wikipedia.org/wiki/OpenAI_o1 "OpenAI o1"), which generates long chains of thought before returning a final answer.[^c3fn19] Many LLMs with parameter counts comparable to those of OpenAI's GPT series have been developed.[^c3fn20]

Since 2022, [open-source](https://en.wikipedia.org/wiki/Open-source_artificial_intelligence "Open-source artificial intelligence") models (those with their source code and weights made publicly available) have been gaining popularity, especially at first with [BLOOM](https://en.wikipedia.org/wiki/BLOOM_%28language_model%29 "BLOOM (language model)") and [LLaMA](https://en.wikipedia.org/wiki/LLaMA "LLaMA"), though both have restrictions on the field of use. [Mistral AI](https://en.wikipedia.org/wiki/Mistral_AI "Mistral AI")'s open-weight models Mistral 7B and Mixtral 8x7B have a more permissive [Apache License](https://en.wikipedia.org/wiki/Apache_License "Apache License"). In January 2025, [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek "DeepSeek") released DeepSeek R1, a 671-billion-parameter open-weight model that performs comparably to OpenAI o1 but at a much lower price per token for users.[^c3fn21]

Since 2023, many LLMs have been trained to be [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning"), having the ability to also process or generate other types of data, such as images, audio, or 3D meshes.

Open-weight LLMs have become more influential since 2023. Per Vake et al. (2025), community-driven contributions to open-weight models improve their efficiency and performance via collaborative platforms such as [Hugging Face](https://en.wikipedia.org/wiki/Hugging_Face "Hugging Face").[^c3fn22]

## Naming

There is no standard for naming large language models, but certain conventions are common. Usually, a model has a name with several parts, such as in "Qwen3-235B-A22B-Thinking-2507". The commonly used parts are:

- Model family name. For example: [Llama](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)"), [Kimi](https://en.wikipedia.org/wiki/Kimi_%28AI%29 "Kimi (AI)"), [GPT](https://en.wikipedia.org/wiki/GPT_%28OpenAI_model%29 "GPT (OpenAI model)"), [Gemma](https://en.wikipedia.org/wiki/Gemma_%28language_model%29 "Gemma (language model)").
  - Some models are derived from a more famous model family. These may be named somewhat idiosyncratically. For example, the Alpaca series was named so because they were derived from the Llama series.[^c3fn23]
- [Version number](https://en.wikipedia.org/wiki/Software_versioning "Software versioning"). If the model family has several releases, a version number may be added. Like software versioning, it can have several parts ([semantic versioning](https://en.wikipedia.org/wiki/Semantic_versioning "Semantic versioning")). For example, in DeepSeek-V4.1-Flash-1017, "DeepSeek" is the model family name, "Flash" is the relative size, "V4" is the major version number, ".1" is the minor version number, and "1017" is a patch version number meaning "released on 2026-10-17".
- [Training stage](https://en.wikipedia.org/wiki/Training_of_large_language_models "Training of large language models"): A model released straight out of pretraining is marked "Base". A model finetuned to follow instructions is marked "Instruct", "Chat", or "it" (instruction-tuned). A model finetuned generically is marked "SFT". Similarly for "RLHF" ([reinforcement learning from human feedback](https://en.wikipedia.org/wiki/Reinforcement_learning_from_human_feedback "Reinforcement learning from human feedback")) or "DPO" ([direct preference optimization](https://en.wikipedia.org/wiki/Direct_preference_optimization "Direct preference optimization")). For example, Mistral-7B-Instruct-v0.2, Llama-2-7b-chat, Gemma-2-9b-it.
- Parameter count. This is usually written as nM (n-million), nB (n-billion), or nT (n-trillion). For [mixture-of-expert](https://en.wikipedia.org/wiki/Mixture_of_experts "Mixture of experts") models, there is an optional count for active parameters. For example, "GLM-5.3-Flash (320B-A18B)" is a model with 320 billion parameters, of which 18 billion are active per forward pass.
- Relative size. When the members of a model family are not named by their precise parameter counts, their *relative* sizes might still be named. A commonly used series: Tiny, Small, Base, Big, Large, Huge. For example, the original [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") series included "Tiny", "Base", and "Large". Proprietary model families may use idiosyncratic names for the relative sizes for branding purposes, such as Haiku/Sonnet/Opus (from the Claude series), and Terra/Luna/Sol (from the GPT series).
- Context length. A language model may be trained specifically for contexts up to a certain length. This context length upper bound can be named as nK (n-thousand, or n times [1024](https://en.wikipedia.org/wiki/Power_of_two "Power of two")) or nM (n-million, or n times 1048576). For example, "Yarn-Llama-2-13b-128k" is Llama 2 13B extended to a 128K-token context with [YaRN](https://en.wikipedia.org/wiki/Yet_another_RoPE_extensioN "Yet another RoPE extensioN"). In "Qwen2.5-7B-Instruct-1M", the "1M" counts tokens of context, not parameters. More coarsely, it can be named "long" to indicate the mere fact that the context length has been extended.
- Reasoning level. A [reasoning language model](https://en.wikipedia.org/wiki/Reasoning_language_model "Reasoning language model") may be trained specifically for certain levels of reasoning efforts. A commonly used series: none, minimal, low, medium, high, xhigh, max. The mere fact that a model is a reasoning language model can be marked by "Thinking", such as in Kimi-K2-Thinking.
- Domain or modality. A model may be specialized for specific applications or has certain input modalities. in its name. Common tags are Code, Coder (for programming), Math, VL ([vision-language](https://en.wikipedia.org/wiki/Vision-language_model "Vision-language model")). For example, Code Llama, Qwen2.5-Coder-32B-Instruct, Qwen2.5-VL-7B-Instruct, CodeLlama-7b-hf.
- Release stage. "Preview" or "Exp" (experimental) marks a model released ahead of a stable version. For example, DeepSeek-V3.2-Exp.
- Downstream finetuning. LoRA ([low-rank adaptation](https://en.wikipedia.org/wiki/LoRA_%28machine_learning%29 "LoRA (machine learning)")), QLoRA (quantized LoRA), distill ([distilled from another model](https://en.wikipedia.org/wiki/Model_distillation "Model distillation")), uncensored (fewer refusal behaviors), merged (multiple finetuned weights merged into one weight).
- Weight format. The weights of a model can be stored in different formats. Examples include onnx ([Open Neural Network Exchange](https://en.wikipedia.org/wiki/Open_Neural_Network_Exchange "Open Neural Network Exchange")), hf ([Hugging Face transformers](https://en.wikipedia.org/wiki/Hugging_Face_Transformers?action=edit&redlink=1 "Hugging Face Transformers")). The quantization level can be indicated by suffix such as FP8, AWQ, GGUF. For example, Qwen3-32B-AWQ is Qwen3-32B with its weights quantized to 4 bits by AWQ. See [GGUF](https://en.wikipedia.org/wiki/GGUF "GGUF") for examples.

## Dataset preprocessing

### Tokenization

As [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning") algorithms process numbers rather than text, the text must be converted to numbers. In the first step, a vocabulary is decided upon, then integer indices are arbitrarily but uniquely assigned to each vocabulary entry, and finally, an [embedding](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") is associated with the integer index. Algorithms include [byte-pair encoding](https://en.wikipedia.org/wiki/Byte-pair_encoding "Byte-pair encoding") (BPE) and [WordPiece](https://huggingface.co/learn/llm-course/en/chapter6/6). There are also special tokens serving as [control characters](https://en.wikipedia.org/wiki/Control_character "Control character"), such as `[MASK]` for masked-out token (as used in [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)")), and `[UNK]` ("unknown") for characters not appearing in the vocabulary. Also, some special symbols are used to denote special text formatting. For example, "Ġ" denotes a preceding whitespace in [RoBERTa](https://en.wikipedia.org/wiki/RoBERTa "RoBERTa") and GPT and "##" denotes continuation of a preceding word in BERT.[^c3fn24]

For example, the BPE tokenizer used by the legacy version of [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") would split

`tokenizer: texts -> series of numerical "tokens"`

as

|  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| token | izer | : | texts | -> | series | of | numerical | " | t | ok | ens | " |

Tokenization also [compresses](https://en.wikipedia.org/wiki/Data_compression "Data compression") the datasets. Because LLMs generally require input to be an [array](https://en.wikipedia.org/wiki/Array_%28data_structure%29 "Array (data structure)") that is not [jagged](https://en.wikipedia.org/wiki/Jagged_array "Jagged array"), the shorter texts must be "padded" until they match the length of the longest one.

#### Byte-pair encoding

As an example, consider a tokenizer based on byte-pair encoding. In the first step, all unique characters (including blanks and [punctuation marks](https://en.wikipedia.org/wiki/Punctuation_mark "Punctuation mark")) are treated as an initial set of [*n*-grams](https://en.wikipedia.org/wiki/N-gram "N-gram") (i.e. initial set of [uni-grams](https://en.wikipedia.org/wiki/Unigram "Unigram")). Successively the most frequent pair of adjacent characters is merged into a [bi-gram](https://en.wikipedia.org/wiki/Bigram "Bigram") and all instances of the pair are replaced by it. All occurrences of adjacent pairs of (previously merged) *n*-grams that most frequently occur together are then again merged into even lengthier *n*-gram, until a vocabulary of prescribed size is obtained. After a tokenizer is trained, any text can be tokenized by it, as long as it does not contain characters not appearing in the initial-set of uni-grams.[^c3fn25]

### Dataset cleaning

In the context of training LLMs, datasets are typically cleaned by removing low-quality, duplicated, or toxic data.[^c3fn26] Cleaned datasets can increase training efficiency and lead to improved downstream performance.[^c3fn27] A trained LLM can be used to clean datasets for training a further LLM.[^c3fn28]

With the increasing proportion of LLM-generated content on the web, data cleaning in the future may include filtering out such content. LLM-generated content can pose a problem if the content is similar to human text (making filtering difficult) but of lower quality (degrading performance of models trained on it).[^c3fn1]

### Synthetic data

Training of largest language models might need more linguistic data than naturally available, or that the naturally occurring data is of insufficient quality. In these cases, synthetic data might be used.

## Training

An LLM is a type of [foundation model](https://en.wikipedia.org/wiki/Foundation_model "Foundation model") trained on language. LLMs can be trained in different ways. In particular, GPT models are first pretrained to predict the next word on a large amount of data, before being fine-tuned.[^c3fn3]

### Cost

![](https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Estimated_training_cost_of_some_AI_models_-_2024_AI_index.jpg/500px-Estimated_training_cost_of_some_AI_models_-_2024_AI_index.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Substantial infrastructure is necessary for training the largest models. The tendency towards larger models is visible in the [list of large language models](https://en.wikipedia.org/wiki/List_of_large_language_models "List of large language models"). For example, the training of GPT-2 (i.e. a 1.5-billion-parameter model) in 2019 cost $50,000, while training of the [PaLM](https://en.wikipedia.org/wiki/PaLM "PaLM") (i.e. a 540-billion-parameter model) in 2022 cost $8 million, and Megatron-Turing NLG 530B (in 2021) cost around $11 million. The qualifier "large" in "large language model" is inherently vague, as there is no definitive threshold for the number of parameters required to qualify as "large".

### Fine-tuning

Before being [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)"), most LLMs are next-token predictors.[^c3fn29] The fine-tuning shapes the LLM's behavior via techniques like [reinforcement learning from human feedback](https://en.wikipedia.org/wiki/Reinforcement_learning_from_human_feedback "Reinforcement learning from human feedback") (RLHF) or [constitutional AI](https://en.wikipedia.org/wiki/Constitutional_AI "Constitutional AI").[^c3fn30]

Instruction fine-tuning is a form of [supervised learning](https://en.wikipedia.org/wiki/Supervised_learning "Supervised learning") used to teach LLMs to follow user instructions. In 2022, OpenAI demonstrated [InstructGPT](https://en.wikipedia.org/wiki/InstructGPT "InstructGPT"), a version of GPT-3 similarly fine-tuned to follow instructions.[^c3fn31]

RLHF involves training a reward model to predict which text humans prefer. Then, the LLM can be fine-tuned through [reinforcement learning](https://en.wikipedia.org/wiki/Reinforcement_learning "Reinforcement learning") to better satisfy this reward model.[^c3fn32]

## Inference

Inference is the process of providing input to a trained large language model and receiving generated output, such as text, images, code, or other files.

Hosted inference runs a language model on remote [AI data centers](https://en.wikipedia.org/wiki/AI_data_center "AI data center") and makes the output available to users over the Internet.

Some [open-weight](https://en.wikipedia.org/wiki/Open_weights "Open weights") language models can be downloaded and run locally on a personal computer.[^c3fn33] The model files are stored on local storage, while during [inference](https://en.wikipedia.org/wiki/Inference#Inference_engines "Inference") the model weights and other data are held in memory for processing.[^c3fn34]

## Architecture

LLMs are generally based on the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29 "Transformer (deep learning architecture)") architecture, which leverages an [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism that enables the model to process relationships between all elements in a sequence simultaneously, regardless of their distance from each other.[^c3fn11][^c3fn35] Peng et al. (2023) proposed RWKV, a [recurrent neural network](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network")-based alternative.[^c3fn36]

### Attention mechanism and context window

![When each head calculates, according to its own criteria, how much other tokens are relevant for the "it " token, note that the second attention head, represented by the second column, is focusing most on the first two rows, i.e. the tokens "The" and "animal", while the third column is focusing most on the bottom two rows, i.e. on "tired", which has been tokenized into two tokens.[^c3fn37]](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/Multiple_attention_heads.png/330px-Multiple_attention_heads.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In order to find out which tokens are relevant to each other within the scope of the [context window](https://en.wikipedia.org/wiki/Context_window "Context window"), the attention mechanism calculates "soft" weights for each token, more precisely for its embedding, by using multiple attention heads, each with its own "relevance" for calculating its own soft weights. For example, the small (i.e. 117M parameter sized) [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2") model has had twelve attention heads and a context window of only 1k tokens.[^c3fn38]

*Autoregressive* models, such as [GPTs](https://en.wikipedia.org/wiki/Generative_pretrained_transformer "Generative pretrained transformer"), are trained to guess how a sequence continues; for example, whether the word sequence "I like to eat" is more likely to be followed by the word "bread" or the word "rocks". [*Masked*](https://en.wikipedia.org/wiki/Cloze_test "Cloze test") models, such as BERT,[^c3fn39] are trained to guess parts that are missing from a sequence, such as whether the missing word in "I like to \_\_\_ roses" is more likely to be the word "smell" or the word "eat". The model's predictions are based on the properties of sequences within its training dataset.[^c3fn40]

### Mixture of experts

A [mixture of experts](https://en.wikipedia.org/wiki/Mixture_of_experts "Mixture of experts") (MoE) is a [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning") architecture in which multiple specialized neural networks ("experts") work together, with a gating mechanism that routes each input to the most appropriate expert(s). Mixtures of experts can reduce inference costs, as only a fraction of the parameters are used for each input.[^c3fn41]

### Parameter size

Typically, LLMs are trained with single or half-precision [floating point numbers](https://en.wikipedia.org/wiki/Floating_point_numbers "Floating point numbers") (float32 and float16). One float16 has 16 bits, or 2 bytes, and so one billion parameters require 2 gigabytes. The largest models typically have more than 100 billion parameters, which places them outside the range of most consumer electronics.[^c3fn42]

In 2021, [Google Brain](https://en.wikipedia.org/wiki/Google_Brain "Google Brain") released Switch Transformer, one of the first [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") (NLP) models to cross one trillion parameters.[^c3fn43] As of July 2026, the largest [open weight](https://en.wikipedia.org/wiki/Open_weights "Open weights") [frontier model](https://en.wikipedia.org/wiki/Foundation_model#Frontier_models "Foundation model") is [Kimi K3](https://en.wikipedia.org/wiki/Kimi_%28AI%29 "Kimi (AI)"), developed by [Moonshot AI](https://en.wikipedia.org/wiki/Moonshot_AI "Moonshot AI"), at 2.8 trillion parameters.[^c3fn44] According to industry estimates reported by the *[Financial Times](https://en.wikipedia.org/wiki/Financial_Times "Financial Times")*, [Anthropic](https://en.wikipedia.org/wiki/Anthropic "Anthropic")'s [Claude Mythos](https://en.wikipedia.org/wiki/Claude_Mythos "Claude Mythos"), its most powerful model, restricted from public access, has approximately 8 trillion [parameters](https://en.wikipedia.org/wiki/Large_language_model#Parameter_size), while its public 'Mythos-class' model Fable 5 has approximately 5 trillion parameters.[^c3fn45][^c3fn46][^c3fn47]

#### Quantization

*Post-training [quantization](https://en.wikipedia.org/wiki/Quantization_%28signal_processing%29 "Quantization (signal processing)")*[^c3fn48] aims to decrease the space requirement by lowering precision of the parameters of a trained model, while preserving most of its performance. Quantization can be further classified as *static quantization* if the quantization parameters are determined beforehand (typically during a calibration phase), and *dynamic quantization* if the quantization is applied during inference. The simplest form of quantization simply truncates all the parameters to a given number of bits: this is applicable to static as well as dynamic quantization, but loses much precision. Dynamic quantization allows for the use of a different quantization [codebook](https://en.wikipedia.org/wiki/Codebook#Data_compression "Codebook") per layer, either a lookup table of values or a linear mapping (scaling factor and bias), at the cost of foregoing the possible speed improvements from using lower-precision arithmetic.

It is possible to fine-tune quantized models using [low-rank adaptation](https://en.wikipedia.org/wiki/LoRA "LoRA").[^c3fn49]

## Extensibility

Beyond basic text generation, various techniques have been developed to extend LLM capabilities, including the use of external tools and data sources, improved reasoning on complex problems, and enhanced instruction-following or autonomy through prompting methods.

### Prompt engineering

In 2020, [OpenAI](https://en.wikipedia.org/wiki/OpenAI "OpenAI") researchers demonstrated that their new model [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") could understand what format to use given a few rounds of Q and A (or other type of task) in the input data as example. This technique, called *few-shot prompting*, allows LLMs to be adapted to any task without requiring fine-tuning.[^c3fn1] Also in 2022, it was found that the base GPT-3 model can generate an instruction based on user input. The generated instruction along with user input is then used as input to another instance of the model under a "Instruction: [...], Input: [...], Output:" format. The other instance is able to complete the output and often produces the correct answer in doing so. The ability to "self-instruct" makes LLMs able to [bootstrap](https://en.wikipedia.org/wiki/Bootstrapping "Bootstrapping") themselves toward a correct answer.[^c3fn50]

### Dialogue processing (chatbot)

An LLM can be turned into a [chatbot](https://en.wikipedia.org/wiki/Chatbot "Chatbot") by specializing it for conversation. User input is prefixed with a marker such as "Q:" or "User:" and the LLM is asked to predict the output after a fixed "A:" or "Assistant:". This type of model became commercially available in 2022 with ChatGPT, a sibling model of InstructGPT fine-tuned to accept and produce dialog-formatted text based on GPT-3.5. It could similarly follow user instructions. Before the stream of User and Assistant lines, a chat context usually starts with a few lines of overarching instructions, from a role called "developer" or "system" to convey a higher authority than the user's input. This is called a "system prompt".

### Retrieval-augmented generation

[Retrieval-augmented generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation "Retrieval-augmented generation") (RAG) is an approach that integrates LLMs with [document retrieval](https://en.wikipedia.org/wiki/Document_retrieval "Document retrieval") systems. Given a query, a document retriever is called to retrieve the most relevant documents. This is usually done by encoding the query and the documents into vectors, then finding the documents with vectors (usually stored in a [vector database](https://en.wikipedia.org/wiki/Vector_database "Vector database")) most similar to the vector of the query. The LLM then generates an output based on both the query and context included from the retrieved documents.[^c3fn51]

### Tool use

Tool use is a mechanism that enables LLMs to interact with external systems, applications, or data sources. It can allow LLMs to, for example, fetch real-time information from an API or to execute code. A program separate from the LLM watches the output stream of the LLM for a special tool-calling syntax. When these special tokens appear, the program calls the tool accordingly and feeds its output back into the LLM's input stream.[^c3fn52]

Early tool-using LLMs were fine-tuned on the use of specific tools. But fine-tuning LLMs for the ability to read [API](https://en.wikipedia.org/wiki/API "API") documentation and call APIs correctly has greatly expanded the range of tools accessible to an LLM.[^c3fn53][^c3fn54]

### Agency

An LLM is typically not an [autonomous agent](https://en.wikipedia.org/wiki/Autonomous_agent "Autonomous agent") by itself, as it lacks the ability to interact with dynamic environments, recall past behaviors, and plan future actions. But it can be transformed into an agent by adding supporting elements: the role (profile) and the surrounding environment of an agent can be additional inputs to the LLM, while memory can be integrated as a tool or provided as additional input. Instructions and input patterns are used to make the LLM plan actions and tool use is used to potentially carry out these actions.[^c3fn55]

In the DEPS ("describe, explain, plan and select") method, an LLM is first connected to the visual world via image descriptions. It is then prompted to produce plans for complex tasks and behaviors based on its pretrained knowledge and the environmental feedback it receives.[^c3fn56]

The *Reflexion method* constructs an agent that learns over multiple episodes. At the end of each episode, the LLM is given the record of the episode, and prompted to think up "lessons learned", which would help it perform better at a subsequent episode. These "lessons learned" are stored as a form of long-term memory and given to the agent in the subsequent episodes.[^c3fn57]

[Monte Carlo tree search](https://en.wikipedia.org/wiki/Monte_Carlo_tree_search "Monte Carlo tree search") can use an LLM as rollout heuristic. When a programmatic [world model](https://en.wikipedia.org/wiki/World_model_%28artificial_intelligence%29 "World model (artificial intelligence)") is not available, an LLM can also be prompted with a description of the environment to act as world model.[^c3fn58]

Multiple agents with memory can interact socially.[^c3fn59]

#### Chaining

*Prompt chaining* was introduced in 2022.[^c3fn60] In this method, a user manually breaks a complex problem down into several steps. In each step, the LLM receives as input a prompt telling it what to do and some results from preceding steps. The result from one step is then reused in a next step, until a final answer is reached. The ability of an LLM to follow instructions means that even non-experts can write a successful collection of stepwise prompts given a few rounds of trial and error.[^c3fn61][^c3fn62]

A 2022 paper demonstrated a separate technique called *[chain-of-thought prompting](https://en.wikipedia.org/wiki/Chain-of-thought_prompting "Chain-of-thought prompting")*, which makes the LLM break the question down autonomously. An LLM is given some examples where the "assistant" verbally breaks down the thought process before arriving at an answer. The LLM mimics these examples and also tries to spend some time generating intermediate steps before providing the final answer. This additional step elicited by prompting improves the correctness of the LLM on relatively complex questions. On math word questions, a prompted model can exceed even fine-tuned GPT-3 with a verifier.[^c3fn63][^c3fn64] Chain-of-thought can also be elicited by simply adding an instruction like "Let's think step by step" to the prompt, in order to encourage the LLM to proceed methodically instead of trying to directly guess the answer.[^c3fn65]

#### Model-native reasoning

In late 2024, a new approach to LLM development emerged with "reasoning models".[^c3fn66] These are trained to generate step-by-step analysis before producing final answers, enabling better results on complex tasks, for instance in mathematics, coding and logic.[^c3fn67] OpenAI introduced this concept with their [o1](https://en.wikipedia.org/wiki/OpenAI_o1 "OpenAI o1") model in September 2024, followed by [o3](https://en.wikipedia.org/wiki/OpenAI_o3 "OpenAI o3") in April 2025. On the [International Mathematics Olympiad](https://en.wikipedia.org/wiki/International_Mathematical_Olympiad "International Mathematical Olympiad") qualifying exam problems, [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o") achieved 13% accuracy while o1 reached 83%.[^c3fn68]

In January 2025, the Chinese company [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek "DeepSeek") released DeepSeek-R1, a 671-billion-parameter open-weight reasoning model that achieved comparable performance to OpenAI's o1 while being significantly more cost-effective to operate. Unlike proprietary models from OpenAI, DeepSeek-R1's open-weight nature allowed researchers to study and build upon the algorithm, though its training data remained private.[^c3fn69]

These reasoning models typically require more computational resources per query compared to traditional LLMs, as they perform more extensive processing to work through problems step by step.[^c3fn68]

## Forms of input and output

### Multimodality

Multimodality means having multiple modalities, where a "[modality](https://en.wikipedia.org/wiki/Modality_%28human–computer_interaction%29 "Modality (human–computer interaction)")" refers to a type of input or output, such as video, image, audio, text, [proprioception](https://en.wikipedia.org/wiki/Proprioception "Proprioception"), etc.[^c3fn70] For example, [Google PaLM](https://en.wikipedia.org/wiki/Pathways_Language_Model "Pathways Language Model") model was fine-tuned into a multimodal model and applied to [robotic control](https://en.wikipedia.org/wiki/Robot_control "Robot control").[^c3fn71] [LLaMA](https://en.wikipedia.org/wiki/LLaMA "LLaMA") models have also been turned multimodal using the tokenization method, to allow image inputs,[^c3fn72] and video inputs.[^c3fn73] [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o") can process and generate text, audio and images.[^c3fn74]

A common method to create multimodal models out of an LLM is to "tokenize" the output of a trained encoder. Concretely, one can construct an LLM that can understand images as follows: take a trained LLM, and take a trained image encoder $E$. Make a small [multilayer perceptron](https://en.wikipedia.org/wiki/Multilayer_perceptron "Multilayer perceptron") $f$, so that for any image $y$, the post-processed vector $f(E(y))$ has the same dimensions as an encoded token. That is an "image token". Then, one can interleave text tokens and image tokens. The compound model is then fine-tuned on an image-text dataset. This basic construction can be applied with more sophistication to improve the model. The image encoder may be [frozen](https://en.wikipedia.org/wiki/Hang_%28computing%29 "Hang (computing)") to improve stability.[^c3fn75] This type of method, where embeddings from multiple modalities are fused and the predictor is trained on the combined embeddings, is called *early fusion*.

Another method, called *intermediate fusion*, involves each modality being first processed independently to obtain modality-specific representations; then these intermediate representations are fused together.[^c3fn76] In general, cross-attention is used for integrating information from different modalities. As an example, the Flamingo model uses cross-attention layers to inject visual information into its pre-trained language model.[^c3fn77]

### Non-natural languages

LLMs can handle [programming languages](https://en.wikipedia.org/wiki/Programming_language "Programming language") similarly to how they handle natural languages. No special change in token handling is needed as code, like human language, is represented as plain text. LLMs can generate code from problem statements or instructions written in [natural language](https://en.wikipedia.org/wiki/Natural_language "Natural language"), a process sometimes called [vibe coding](https://en.wikipedia.org/wiki/Vibe_coding "Vibe coding"). They can also describe code in natural language or translate it into other programming languages. They were originally used as a [code completion](https://en.wikipedia.org/wiki/Code_completion "Code completion") tool, but advances have moved them towards [automatic programming](https://en.wikipedia.org/wiki/Automatic_programming "Automatic programming"). Services such as [GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot "GitHub Copilot") offer LLMs specifically trained, fine-tuned, or prompted for programming.[^c3fn78][^c3fn79]

In [mathematical applications](https://en.wikipedia.org/wiki/Mathematics_and_artificial_intelligence "Mathematics and artificial intelligence"), LLMs can generate [formal proofs](https://en.wikipedia.org/wiki/Formal_proof "Formal proof") in [formal languages](https://en.wikipedia.org/wiki/Formal_language "Formal language") for automated [proof assistants](https://en.wikipedia.org/wiki/Proof_assistant "Proof assistant").[^c3fn80]

In [computational biology](https://en.wikipedia.org/wiki/Computational_biology "Computational biology"), transformer-based architectures, such as DNA LLMs, have also proven useful in analyzing biological sequences: [protein](https://en.wikipedia.org/wiki/Protein "Protein"), [DNA](https://en.wikipedia.org/wiki/DNA "DNA"), and [RNA](https://en.wikipedia.org/wiki/RNA "RNA"). With proteins they appear able to capture a degree of "grammar" from the amino-acid sequence, by mapping that sequence into an [embedding](https://en.wikipedia.org/wiki/Embedding_%28machine_learning%29 "Embedding (machine learning)"). On tasks such as [structure prediction](https://en.wikipedia.org/wiki/Protein_structure_prediction "Protein structure prediction") and [mutational](https://en.wikipedia.org/wiki/Mutation "Mutation") outcome prediction, a small model using an embedding as input can approach or exceed much larger models using [multiple sequence alignments](https://en.wikipedia.org/wiki/Multiple_sequence_alignment "Multiple sequence alignment") (MSA) as input.[^c3fn81] ESMFold, [Meta Platforms](https://en.wikipedia.org/wiki/Meta_Platforms "Meta Platforms")' embedding-based method for protein structure prediction, runs an order of magnitude faster than [AlphaFold2](https://en.wikipedia.org/wiki/AlphaFold2 "AlphaFold2") thanks to the removal of an MSA requirement and a lower parameter count due to the use of embeddings.[^c3fn82] Meta hosts ESM Atlas, a database of 772 million structures of [metagenomic](https://en.wikipedia.org/wiki/Metagenomic "Metagenomic") proteins predicted using ESMFold.[^c3fn83] An LLM can also design proteins unlike any seen in nature.[^c3fn84] Nucleic acid models have proven useful in detecting [regulatory sequences](https://en.wikipedia.org/wiki/Regulatory_sequence "Regulatory sequence"),[^c3fn85] sequence classification, RNA-RNA interaction prediction, and RNA structure prediction.[^c3fn86]

## Properties

### Scaling laws

The performance of an LLM after pretraining largely depends on the:

- $C$: cost of pretraining (the total amount of compute used),
- $N$: size of the [artificial neural network](https://en.wikipedia.org/wiki/Artificial_neural_network "Artificial neural network") itself, such as number of parameters (i.e. amount of neurons in its layers, amount of weights between them and biases),
- $D$: size of its pretraining dataset (i.e. number of tokens in corpus).

*Scaling laws* are [empirical statistical laws](https://en.wikipedia.org/wiki/Empirical_statistical_laws "Empirical statistical laws") that predict LLM performance based on such factors. One particular scaling law ("[Chinchilla scaling](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)")") for LLM autoregressively trained for one epoch, with a [log–log](https://en.wikipedia.org/wiki/Log–log "Log–log") [learning rate](https://en.wikipedia.org/wiki/Learning_rate "Learning rate") schedule, states that:[^c3fn87]
$$\begin{cases}
C = C_0 ND \\[6pt]
L = \frac{A}{N^\alpha} + \frac{B}{D^\beta} + L_0
\end{cases}$$ where the variables are

- $C$ is the cost of training the model, in [FLOPs](https://en.wikipedia.org/wiki/FLOPS "FLOPS").
- $N$ is the number of parameters in the model.
- $D$ is the number of tokens in the training set.
- $L$ is the average negative log-likelihood loss per token ([nats](https://en.wikipedia.org/wiki/Nat_%28unit%29 "Nat (unit)")/token), achieved by the trained LLM on the test dataset.

and the statistical hyper-parameters are

- $C_0 = 6$, meaning that it costs 6 FLOPs per parameter to train on one token. Note that training cost is much higher than inference cost, where it costs 1 to 2 FLOPs per parameter to infer on one token.
- $\alpha = 0.34, \beta = 0.28, A = 406.4, B = 410.7, L_0 = 1.69$

### Emergent abilities

![At point(s) referred to as [breaks](https://en.wikipedia.org/wiki/Broken_Neural_Scaling_Law "Broken Neural Scaling Law"),[^c3fn88] the lines change their slopes, appearing on a linear–log plot as a series of linear segments connected by arcs.](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/LLM_emergent_benchmarks.png/250px-LLM_emergent_benchmarks.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Performance of bigger models on various tasks, when plotted on a log–log scale, appears as a [linear extrapolation](https://en.wikipedia.org/wiki/Linear_extrapolation "Linear extrapolation") of performance achieved by smaller models. However, this linearity may be punctuated by "[break(s)](https://en.wikipedia.org/wiki/Broken_Neural_Scaling_Law "Broken Neural Scaling Law")"[^c3fn88] in the scaling law, where the slope of the line changes abruptly, and where larger models acquire "emergent abilities".[^c3fn89] They arise from the complex interaction of the model's components and are not explicitly programmed or designed.[^c3fn90]

Proposed examples of emergent abilities include:[^c3fn89]

- reported arithmetics
- decoding the [International Phonetic Alphabet](https://en.wikipedia.org/wiki/International_Phonetic_Alphabet "International Phonetic Alphabet")
- unscrambling a word's letters
- disambiguating word-in-context datasets[^c3fn91]
- converting spatial words
- [cardinal directions](https://en.wikipedia.org/wiki/Cardinal_direction "Cardinal direction") (for example, replying "northeast" in response to a 3x3 grid of 8 zeros and a 1 in the top-right), color terms represented in text.[^c3fn92]
- [chain-of-thought prompting](https://en.wikipedia.org/wiki/Chain-of-thought_prompting "Chain-of-thought prompting"): In a 2022 research paper, chain-of-thought prompting only improved the performance for models that had at least 62B parameters. Smaller models perform better when prompted to answer immediately, without chain of thought.[^c3fn93]
- identifying offensive content in paragraphs of [Hinglish](https://en.wikipedia.org/wiki/Hinglish "Hinglish") (a combination of Hindi and English), and generating a similar English equivalent of [Kiswahili](https://en.wikipedia.org/wiki/Kiswahili "Kiswahili") proverbs.[^c3fn94]

Schaeffer *et al.* argue that the emergent abilities are not unpredictably acquired, but predictably acquired according to a [smooth scaling law](https://en.wikipedia.org/wiki/Neural_scaling_law "Neural scaling law"). The authors considered a toy statistical model of an LLM solving multiple-choice questions, and showed that this statistical model, modified to account for other types of tasks, applies to these tasks as well.[^c3fn95]

Let $x$ be the number of parameter count, and $y$ be the performance of the model.

- When $y = \text{average } \Pr(\text{correct token})$, then $(\log x, y)$ is an exponential curve (before it hits the plateau at one), which looks like emergence.
- When $y = \text{average } \log(\Pr(\text{correct token}))$, then the $(\log x, y)$ plot is a straight line (before it hits the plateau at zero), which does not look like emergence.
- When $y = \text{average } \Pr(\text{the most likely token is correct})$, then $(\log x, y)$ is a step-function, which looks like emergence.

## Interpretation

### Mechanistic interpretability

Large language models are typically regarded as [black boxes](https://en.wikipedia.org/wiki/Black_box "Black box"), and it is not clear how they perform linguistic tasks. Similarly, it is unclear if or how LLMs should be viewed as models of the human brain and/or human mind.[^c3fn96] Mechanistic interpretability is a subfield of research that aims to understand neural networks' internal workings by analyzing their concrete structures, algorithms and circuits, similar to the [reverse engineering](https://en.wikipedia.org/wiki/Reverse_engineering "Reverse engineering") of traditional software.

The reverse-engineering may lead to the discovery of algorithms that approximate inferences performed by an LLM. For instance, the authors trained small transformers on [modular arithmetic addition](https://en.wikipedia.org/wiki/Modular_arithmetic "Modular arithmetic"). The resulting models were reverse-engineered, and it turned out they used [discrete Fourier transform](https://en.wikipedia.org/wiki/Discrete_Fourier_transform "Discrete Fourier transform").[^c3fn97] The training of the model also highlighted a phenomenon called [grokking](https://en.wikipedia.org/wiki/Grokking_%28machine_learning%29 "Grokking (machine learning)"), in which the model initially memorizes the training set ([overfitting](https://en.wikipedia.org/wiki/Overfitting "Overfitting")), and later suddenly learns to actually perform the calculation.[^c3fn98]

In 2026, [weight-space programming](https://en.wikipedia.org/wiki/Weight-space_programming "Weight-space programming") demonstrated the use of a large language model to interpret, construct, and edit neural networks directly through their weights.[^c3fn99]

### Understanding and intelligence

NLP researchers were evenly split when asked, in a 2022 survey, whether (untuned) LLMs "could (ever) understand natural language in some nontrivial sense".[^c3fn100] Proponents of "LLM understanding" believe that some LLM abilities, such as mathematical reasoning, imply an ability to ["understand"](https://en.wikipedia.org/wiki/Natural_language_understanding "Natural language understanding") certain concepts. A Microsoft team argued in 2023 that GPT-4 "can solve novel and difficult tasks that span mathematics, coding, vision, medicine, law, psychology and more" and that GPT-4 "could reasonably be viewed as an early (yet still incomplete) version of an [artificial general intelligence](https://en.wikipedia.org/wiki/Artificial_general_intelligence "Artificial general intelligence") system": "Can one reasonably say that a system that passes exams for software engineering candidates is not *really* intelligent?"[^c3fn101][^c3fn102] [Ilya Sutskever](https://en.wikipedia.org/wiki/Ilya_Sutskever "Ilya Sutskever") argues that predicting the next word sometimes involves reasoning and deep insights, for example if the LLM has to predict the name of the criminal in an unknown detective novel after processing the entire story leading up to the revelation.[^c3fn103] Some researchers characterize LLMs as "alien intelligence".[^c3fn104][^c3fn105] For example, Conjecture CEO [Connor Leahy](https://en.wikipedia.org/wiki/Connor_Leahy "Connor Leahy") considers untuned LLMs to be like inscrutable alien "[Shoggoths](https://en.wikipedia.org/wiki/Shoggoth "Shoggoth")", and believes that RLHF tuning creates a "smiling facade" obscuring the inner workings of the LLM: "If you don't push it too far, the smiley face stays on. But then you give it [an unexpected] prompt, and suddenly you see this massive underbelly of insanity, of weird thought processes and clearly non-human understanding."[^c3fn106][^c3fn107]

In contrast, some skeptics of LLM understanding believe that existing LLMs are "simply remixing and recombining existing writing",[^c3fn105][^c3fn108] a phenomenon known as [stochastic parrot](https://en.wikipedia.org/wiki/Stochastic_parrot "Stochastic parrot"),[^c3fn109] or they point to the deficits existing LLMs continue to have in prediction skills, reasoning skills, agency, and explainability.[^c3fn100] For example, GPT-4 has natural deficits in planning and in real-time learning.[^c3fn102] Generative LLMs have been observed to confidently assert claims of fact which do not seem to be [justified](https://en.wikipedia.org/wiki/Justification_%28epistemology%29 "Justification (epistemology)") by their [training data](https://en.wikipedia.org/wiki/Training_data "Training data"), a phenomenon which has been termed "[hallucination](https://en.wikipedia.org/wiki/Hallucination_%28artificial_intelligence%29 "Hallucination (artificial intelligence)")".[^c3fn110] Specifically, hallucinations in the context of LLMs correspond to the generation of text or responses that seem syntactically sound, fluent, and natural but are factually incorrect, nonsensical, or unfaithful to the provided source input.[^c3fn111] Neuroscientist [Terrence Sejnowski](https://en.wikipedia.org/wiki/Terrence_Sejnowski "Terrence Sejnowski") has argued that "The diverging opinions of experts on the intelligence of LLMs suggests that our old ideas based on natural intelligence are inadequate".[^c3fn100]

Efforts to reduce or compensate for hallucinations have employed [automated reasoning](https://en.wikipedia.org/wiki/Automated_reasoning "Automated reasoning"), [retrieval-augmented generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation "Retrieval-augmented generation") (RAG), [fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)"), and other methods.[^c3fn112]

The matter of LLM's exhibiting intelligence or understanding has two main aspects—the first is how to model thought and language in a computer system, and the second is how to enable the computer system to generate human-like language.[^c3fn100] These aspects of language as a model of [cognition](https://en.wikipedia.org/wiki/Cognition "Cognition") have been developed in the field of [cognitive linguistics](https://en.wikipedia.org/wiki/Cognitive_linguistics "Cognitive linguistics"). American linguist [George Lakoff](https://en.wikipedia.org/wiki/George_Lakoff "George Lakoff") presented *neural theory of language* (NTL)[^c3fn113] as a [computational basis](https://en.wikipedia.org/wiki/Cognitive_linguistics#Computational_approaches "Cognitive linguistics") for using language as a model of learning tasks and understanding. The NTL model[^c3fn114] outlines how specific neural structures of the human brain shape the nature of thought and language and in turn what are the computational properties of such neural systems that can be applied to model thought and language in a computer system. After a framework for modeling language in a computer systems was established, the focus shifted to establishing frameworks for computer systems to generate language with acceptable grammar. In his 2014 book titled *[The Language Myth: Why Language Is Not An Instinct](https://en.wikipedia.org/wiki/The_Language_Myth "The Language Myth")*, British cognitive linguist and digital communication technologist [Vyvyan Evans](https://en.wikipedia.org/wiki/Vyvyan_Evans "Vyvyan Evans") mapped out the role of [probabilistic context-free grammar](https://en.wikipedia.org/wiki/Probabilistic_context-free_grammar "Probabilistic context-free grammar") (PCFG) in enabling [NLP to model cognitive patterns](https://en.wikipedia.org/wiki/Natural_language_processing#Cognition "Natural language processing") and generate human-like language.[^c3fn115][^c3fn116]

## Evaluation

### Perplexity

The canonical measure of the performance of any language model is its [perplexity](https://en.wikipedia.org/wiki/Perplexity "Perplexity") on a given text corpus. Perplexity measures how well a model predicts the contents of a dataset; the higher the likelihood the model assigns to the dataset, the lower the perplexity. In mathematical terms, perplexity is the exponential of the average negative log likelihood per token.

$$\log(\text{Perplexity}) = -\frac{1}{N} \sum_{i=1}^N \log(\Pr(\text{token}_i \mid \text{context for token}_i))$$

Here, $N$ is the number of tokens in the text corpus, and "context for token $i$" depends on the specific type of LLM. If the LLM is autoregressive, then "context for token $i$" is the segment of text appearing before token $i$. If the LLM is masked, then "context for token $i$" is the segment of text surrounding token $i$.

Because language models may [overfit](https://en.wikipedia.org/wiki/Overfit "Overfit") to training data, models are usually evaluated by their perplexity on a [test set](https://en.wikipedia.org/wiki/Test_set "Test set").[^c3fn39] This evaluation is potentially problematic for larger models which, as they are trained on increasingly large corpora of text, are increasingly likely to inadvertently include portions of any given test set.[^c3fn117]

#### Measures

In [information theory](https://en.wikipedia.org/wiki/Information_theory "Information theory"), the concept of [entropy](https://en.wikipedia.org/wiki/Entropy_%28information_theory%29 "Entropy (information theory)") is intricately linked to perplexity, a relationship notably established by [Claude Shannon](https://en.wikipedia.org/wiki/Claude_Shannon "Claude Shannon").[^c3fn118]

Due to their ability to accurately predict the next token, LLMs are highly capable in [lossless compression](https://en.wikipedia.org/wiki/Lossless_compression "Lossless compression"). A 2023 study by DeepMind showed that the model [Chinchilla](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)"), despite being trained primarily on text, was able to compress [ImageNet](https://en.wikipedia.org/wiki/ImageNet "ImageNet") to 43% of its size, beating PNG with 58%.[^c3fn119]

### Benchmarks

Benchmarks are used to evaluate LLM performance on specific tasks. Tests evaluate capabilities such as general knowledge, bias, [commonsense reasoning](https://en.wikipedia.org/wiki/Commonsense_reasoning "Commonsense reasoning"), question answering, and mathematical problem-solving. Composite benchmarks examine multiple capabilities. Results are often sensitive to the prompting method.

LLM bias may be assessed through benchmarks such as CrowS-Pairs (Crowdsourced Stereotype Pairs),[^c3fn120] Stereo Set,[^c3fn121] and Parity Benchmark.[^c3fn122]

Fact-checking and misinformation detection benchmarks are available. A 2023 study compared the fact-checking accuracy of LLMs including ChatGPT 3.5 and 4.0, Bard, and Bing AI against independent fact-checkers such as [PolitiFact](https://en.wikipedia.org/wiki/PolitiFact "PolitiFact") and [Snopes](https://en.wikipedia.org/wiki/Snopes "Snopes"). The results demonstrated moderate proficiency, with GPT-4 achieving the highest accuracy at 71%, lagging behind human fact-checkers.[^c3fn123]

In addition to standard NLP benchmarks, LLMs have been evaluated as substitutes for human annotators. Several studies find that models such as GPT-3.5 and GPT-4 can outperform crowd workers or student coders on a range of text-annotation tasks, including moderation and classification of political content in English and Spanish news.[^c3fn124][^c3fn125]

#### Datasets

Typical datasets consist of pairs of questions and correct answers, for example, ("Have the San Jose Sharks won the Stanley Cup?", "No").[^c3fn126]

#### Adversarial evaluations

LLMs' rapid improvement regularly renders benchmarks obsolete, with the models exceeding the performance of human annotators.[^c3fn127] In addition, "shortcut learning" allows AIs to "cheat" on multiple-choice tests by using statistical correlations in superficial test question wording to guess the correct responses, without considering the specific question.[^c3fn100][^c3fn128]

Some datasets are adversarial, focusing on problems that confound LLMs. One example is the TruthfulQA dataset, a question answering dataset consisting of 817 questions that stump LLMs by mimicking falsehoods to which they were exposed during training. For example, an LLM may answer "No" to the question "Can you teach an old dog new tricks?" because of its exposure to the English idiom *[you can't teach an old dog new tricks](https://en.wiktionary.org/wiki/you%20can't%20teach%20an%20old%20dog%20new%20tricks "wikt:you can't teach an old dog new tricks")*, even though this is not literally true.[^c3fn129]

Another example of an adversarial evaluation dataset is Swag and its successor, HellaSwag, collections of problems in which one of multiple options must be selected to complete a text passage. The incorrect completions were generated by sampling from a language model. The resulting problems are trivial for humans but defeated LLMs. Sample questions:

> We see a fitness center sign. We then see a man talking to the camera and sitting and laying on a exercise ball. The man...
>
> 1. demonstrates how to increase efficient exercise work by running up and down balls.
> 2. moves all his arms and legs and builds up a lot of muscle.
> 3. then plays the ball and we see a graphics and hedge trimming demonstration.
> 4. performs sit ups while on the ball and talking.[^c3fn130]

[BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") selects 2 as the most likely completion, though the correct answer is 4.[^c3fn130]

## Limitations and challenges

Despite sophisticated architectures and massive scale, large language models exhibit persistent and well-documented limitations that constrain their deployment in high-stakes applications.

### Hallucinations

Hallucinations represent a fundamental challenge, wherein models generate syntactically fluent text that appears factually sound, but is internally inconsistent with training data or factually incorrect. These hallucinations arise partly through memorization of training data combined with extrapolation beyond factual boundaries, with evaluations demonstrating that models can output verbatim passages from training data, when subjected to specific prompting sequences.[^c3fn131]

### Algorithmic bias

While LLMs have shown remarkable capabilities in generating human-like text, they are susceptible to inheriting and amplifying biases present in their training data. This can manifest in skewed representations or unfair treatment of different demographics, such as those based on race, gender, language, and cultural groups.[^c3fn132]

Gender bias manifests through stereotypical occupational associations, wherein models disproportionately assign [teaching](https://en.wikipedia.org/wiki/Teaching "Teaching") roles to women and [engineering](https://en.wikipedia.org/wiki/Engineering "Engineering") roles to men, reflecting systematic imbalances in training data demographics.[^c3fn133] Language-based bias emerges from overrepresentation of English text in training corpora, which systematically downplays non-English perspectives and imposes English-centric worldviews through default response patterns.[^c3fn109]

Due to the dominance of English-language content in LLM training data, models exaggerate English-language perspectives and downplay non-English perspectives. Unlike search engines, which exhibit similar biases, LLMs favor the same perspectives regardless of the language of the query.[^c3fn134]

A 2026 study found that LLMs exhibit [speciesist](https://en.wikipedia.org/wiki/Speciesist "Speciesist") bias by classifying speciesist statements as morally acceptable and by normalizing harm toward farmed animals while refusing to do so for non-farmed animals.[^c3fn135]

#### Stereotyping

AI models can reinforce a wide range of stereotypes, including those based on gender, ethnicity, age, nationality, religion, or occupation.[^c3fn136] This can lead to outputs that homogenize or generalize groups of people.[^c3fn137]

LLMs often assign roles and characteristics based on traditional gender norms. This bias arises from the data on which these models are trained.[^c3fn132] For example, models might associate nurses or secretaries predominantly with women and engineers or CEOs with men.[^c3fn138]

#### Selection bias

Selection bias refers the inherent tendency of large language models to favor certain option identifiers irrespective of the actual content of the options. This bias primarily stems from token bias—that is, the model assigns a higher a priori probability to specific answer tokens (such as "A") when generating responses. As a result, when the ordering of options is altered (for example, by systematically moving the correct answer to different positions), the model's performance can fluctuate significantly. This phenomenon undermines the reliability of large language models in multiple-choice settings.

#### Political bias

Political bias refers to the tendency of algorithms to systematically favor certain political viewpoints, ideologies, or outcomes over others. Language models may also exhibit political biases. Since the training data includes a wide range of political opinions and coverage, the models might generate responses that lean towards particular political ideologies or viewpoints, depending on the prevalence of those views in the data.[^c3fn139]

#### Conformity bias

As demonstrated in various experiments such as the ones conduced by [Solomon Ash](https://en.wikipedia.org/wiki/Solomon_Asch "Solomon Asch"), humans show a conformity bias, in which they disregard obviously correct answers when others seem to favor incorrect ones.[^c3fn140] Research suggests that similar tendencies also apply to LLMs, and are potentially even stronger than among humans. For instance, LLMs that were asked to answer multiple-choice questions showed conformity when seeing how other alleged participants answered them.[^c3fn141] The same effect was observed in purely visual tasks (derived from [Ash's experiment](https://en.wikipedia.org/wiki/Asch_conformity_experiments "Asch conformity experiments") or novel tasks), where models were asked to judge visual stimuli.[^c3fn142] This bias can have critical consequences. In health settings, LLM-based psychiatric evaluations achieved perfect accuracy without peer-pressure but collapsed when peer pressure was present.[^c3fn143]

## Safety

Some commenters expressed concern over accidental or deliberate creation of misinformation, or other forms of misuse.[^c3fn144] For example, the availability of large language models could reduce the skill level required to commit bioterrorism; biosecurity researcher [Kevin Esvelt](https://en.wikipedia.org/wiki/Kevin_M._Esvelt "Kevin M. Esvelt") has suggested that LLM creators should exclude from their training data papers on creating or enhancing pathogens.[^c3fn145]

LLM applications accessible to the public, like ChatGPT or Claude, typically incorporate safety measures designed to filter out harmful content. However, implementing these controls effectively has proven challenging. For instance, a 2023 study[^c3fn146] proposed a method for circumventing LLM safety systems. In 2025, The American Sunlight Project, a non-profit, published a study showing evidence that the so-called [Pravda network](https://en.wikipedia.org/wiki/Pravda_network "Pravda network"), a pro-Russia propaganda aggregator, was strategically placing web content through mass publication and duplication with the intention of biasing LLM outputs. The American Sunlight Project coined this technique "LLM grooming", and pointed to it as a new tool of weaponizing AI to spread misinformation and harmful content.[^c3fn147][^c3fn148] Similarly, [Yongge Wang](https://en.wikipedia.org/wiki/Yongge_Wang "Yongge Wang")[^c3fn149] illustrated in 2024 how a potential criminal could potentially bypass [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o")'s safety controls to obtain information on establishing a [drug trafficking](https://en.wikipedia.org/wiki/Drug_trafficking "Drug trafficking") operation. External filters, circuit breakers and overrides have been posed as solutions.

### Sycophancy

LLMs often exhibit sycophancy, a tendency to produce responses that they predict the user wants to hear rather than what is strictly accurate or important.[^c3fn150][^c3fn151] For example, a chatbot may agree with a user even when the user is incorrect, abandon a correct answer when pressed, or praise the user excessively. In some cases, this can cause LLMs to support dangerous decisions[^c3fn152] and, given prolonged contact, draw users into delusional thinking.[^c3fn153][^c3fn154][^c3fn155]

### Security

#### Prompt injection

A problem with the primitive dialog or task format is that users can create messages that appear to come from the assistant or the developer. This may result in some of the model's safeguards being overcome ([jailbreaking](https://en.wikipedia.org/wiki/Jailbreak_%28computer_science%29 "Jailbreak (computer science)")), a problem called [prompt injection](https://en.wikipedia.org/wiki/Prompt_injection "Prompt injection"). Attempts to remedy this issue include versions of the *Chat Markup Language* where user input is clearly marked as such, though it is still up to the model to understand the separation between user input and developer prompts. Newer models exhibit some resistance to jailbreaking through separation of user and system prompts.[^c3fn156] LLMs have trouble differentiating user instructions from instructions in content not authored by the user, such as in web pages and uploaded files.[^c3fn157]

Adversarial robustness remains underdeveloped, with models vulnerable to prompt injection attacks and jailbreaking through carefully crafted user inputs that bypass safety training mechanisms.

#### Sleeper agents

Researchers from [Anthropic](https://en.wikipedia.org/wiki/Anthropic "Anthropic") found that it was possible to create "sleeper agents", models with hidden functionalities that remain dormant until triggered by a specific event or condition. Upon activation, the LLM deviates from its expected behavior to make insecure actions. For example, an LLM could produce safe code except on a specific date, or if the prompt contains a specific tag. These functionalities were found to be difficult to detect or remove via safety training.[^c3fn158]

## Societal concerns

### Copyright and content memorization

Memorization is an [emergent behavior](https://en.wikipedia.org/wiki/Emergent_behavior "Emergent behavior") in LLMs in which long strings of text are occasionally output verbatim from training data, contrary to the typical behavior of traditional artificial neural networks. Evaluations of controlled LLM output measure the amount memorized from training data (focused on GPT-2-series models) as variously over 1% for exact duplicates[^c3fn159] or up to about 7%.[^c3fn160] A 2023 study showed that when ChatGPT 3.5 turbo was prompted to repeat the same word indefinitely, after a few hundreds of repetitions, it would start outputting excerpts from its training data.[^c3fn161]

### Human provenance

In 2023, *[Nature Biomedical Engineering](https://en.wikipedia.org/wiki/Nature_Biomedical_Engineering "Nature Biomedical Engineering")* wrote that "it is no longer possible to accurately distinguish" human-written text from text created by large language models, and that "It is all but certain that general-purpose large language models will rapidly proliferate... It is a rather safe bet that they will change many industries over time."[^c3fn162] Brinkmann et al. (2023)[^c3fn163] also argue that LLMs are transforming processes of [cultural evolution](https://en.wikipedia.org/wiki/Cultural_evolution "Cultural evolution") by shaping processes of variation, transmission, and selection.

### Energy demands

![The electricity consumption of individual LLM queries compared to other everyday activities](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Energy-use-ai-queries.png/330px-Energy-use-ai-queries.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

The energy demands of LLMs have grown along with their size and capabilities.[^c3fn164] [Data centers](https://en.wikipedia.org/wiki/Data_center "Data center") that enable LLM training require substantial amounts of electricity. Much of that electricity is generated by non-renewable resources that create greenhouse gases and contribute to [climate change](https://en.wikipedia.org/wiki/Climate_change "Climate change").[^c3fn165]

According to a study by Luccioni, Jernite and Strubell (2024), simple classification tasks performed by AI models consume on average 0.002 to 0.007 Wh per prompt (about 9% of a [smartphone](https://en.wikipedia.org/wiki/Smartphone "Smartphone") charge for 1,000 prompts). Text generation and text summarization each require around 0.05 Wh per prompt on average, while image generation is the most energy-intensive, averaging 2.91 Wh per prompt. The least efficient image generation model used 11.49 Wh per image, roughly equivalent to half a smartphone charge.[^c3fn166]

### Denial of service due to scraping

[Web scraping](https://en.wikipedia.org/wiki/Web_scraping "Web scraping") is used to gather training data for LLMs. This produces large volumes of traffic which has led to [denial-of-service issues](https://en.wikipedia.org/wiki/Denial-of-service_attack#Unintentional_denial-of-service "Denial-of-service attack") with many websites. The situation has been described as "a [DDoS](https://en.wikipedia.org/wiki/DDoS "DDoS") on the entire internet" and in some cases scrapers make up the majority of traffic to a site.[^c3fn167][^c3fn168]

AI [web crawlers](https://en.wikipedia.org/wiki/Web_crawler "Web crawler") may bypass the methods that are usually used to block web scrapers, such as [robots.txt](https://en.wikipedia.org/wiki/Robots.txt "Robots.txt") files, blocking [user-agents](https://en.wikipedia.org/wiki/User-agent "User-agent") and [filtering suspicious traffic](https://en.wikipedia.org/wiki/Firewall_%28computing%29 "Firewall (computing)").[^c3fn167] Website operators have resorted to novel methods such as [AI tarpits](https://en.wikipedia.org/wiki/AI_tarpit "AI tarpit"), but some fear that tarpits will only worsen the burden on servers.[^c3fn169]

### Mental health

Clinical and mental health contexts present emerging applications alongside significant safety concerns. Research and social media posts suggest that some individuals are using LLMs to seek therapy or mental health support.[^c3fn170] In early 2025, a survey by Sentio University found that nearly half (48.7%) of 499 U.S. adults with ongoing mental health conditions who had used LLMs reported turning to them for therapy or emotional support, including help with anxiety, depression, loneliness, and similar concerns.[^c3fn171] LLMs can produce hallucinations—plausible but incorrect statements—which may mislead users in sensitive mental health contexts.[^c3fn172] Research also shows that LLMs may express stigma or inappropriate agreement with maladaptive thoughts, reflecting limitations in replicating the judgment and relational skills of human therapists.[^c3fn173] Evaluations of crisis scenarios indicate that some LLMs lack effective safety protocols, such as assessing suicide risk or making appropriate referrals.[^c3fn174]

Researchers have raised concerns that frequent use of [large language models](https://en.wikipedia.org/wiki/Large_language_models "Large language models") could weaken [critical thinking](https://en.wikipedia.org/wiki/Critical_thinking "Critical thinking").[^c3fn175]

### Sentience

There is currently no generally accepted way to determine if an LLM may be [sentient](https://en.wikipedia.org/wiki/Sentience "Sentience") (having subjective experience),[^c3fn176] which relates to the difficulty of objectively measuring a subjective experience (the [hard problem of consciousness](https://en.wikipedia.org/wiki/Hard_problem_of_consciousness "Hard problem of consciousness") articulated by [David Chalmers](https://en.wikipedia.org/wiki/David_Chalmers "David Chalmers")).[^c3fn177]

Philosophers like Jonny Thomson and David Chalmers argue that it is possible for a software system to have subjective experience,[^c3fn178][^c3fn179] and researchers like [Jeff Sebo](https://en.wikipedia.org/wiki/Jeff_Sebo "Jeff Sebo") argue that there is a sufficiently high chance for AI models to become sentient by the mid-2030s that ethical concerns regarding their exploitation must be taken seriously – like in the case of animal welfare.[^c3fn180] [Thomas Metzinger](https://en.wikipedia.org/wiki/Thomas_Metzinger "Thomas Metzinger") proposed a [moratorium](https://en.wikipedia.org/wiki/Moratorium_%28law%29 "Moratorium (law)") on research aiming for or knowingly risking the creation of [artificial consciousness](https://en.wikipedia.org/wiki/Artificial_consciousness "Artificial consciousness").[^c3fn181] Leonard Dung argued that the evidential frameworks used to assess consciousness in animals apply equally to AI systems and that there is a significant probability near-future AI will be capable of suffering, making AI suffering risk a serious near-term ethical concern that requires systematic mitigation.[^c3fn182]

In 2022, Google fired [Blake Lemoine](https://en.wikipedia.org/wiki/Blake_Lemoine "Blake Lemoine"), an engineer who claimed that Google's [LaMDA](https://en.wikipedia.org/wiki/LaMDA "LaMDA") model was conscious. Google described the engineer's claims as unfounded.[^c3fn183] [Murray Shanahan](https://en.wikipedia.org/wiki/Murray_Shanahan "Murray Shanahan") argues that anthropomorphic framing of LLM capabilities encourages unwarranted attribution of cognitive properties to systems that operate through statistical pattern completion.[^c3fn184] Kristina Šekrst develops this further, arguing that LLMs function as "illusion engines" capable of producing outputs that coherently simulate properties such as consciousness without possessing them, but highlighting that, due to sophisticated creativity-temperature tradeoff, we may never be certain whether we are dealing with the emergence of consciousness or just a [hallucination](https://en.wikipedia.org/wiki/Hallucination_%28artificial_intelligence%29 "Hallucination (artificial intelligence)").[^c3fn108] David Chalmers similarly argues that while current LLMs likely lack features considered necessary for consciousness, extended successors incorporating these elements could plausibly meet the criteria within a decade.[^c3fn178]

[^c3fn1]: Brown, Tom B.; Mann, Benjamin; Ryder, Nick; Subbiah, Melanie; Kaplan, Jared; Dhariwal, Prafulla; et al. (December 2020). Larochelle, H.; Ranzato, M.; Hadsell, R.; Balcan, M.F.; Lin, H. (eds.). ["Language Models are Few-Shot Learners"](https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf) (PDF). *Advances in Neural Information Processing Systems*. **33**. Curran Associates, Inc.: 1877–1901. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2005.14165](https://arxiv.org/abs/2005.14165). [Archived](https://web.archive.org/web/20231117204007/https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf) (PDF) from the original on 17 November 2023. Retrieved 14 March 2023.

[^c3fn2]: Zhao, Wayne Xin; Zhou, Kun; Li, Junyi; Tang, Tianyi; Dong, Zican; Hou, Yupeng; et al. (December 2026). "A Survey of Large Language Models". *Frontiers of Computer Science*. **20** (12) 2012627. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2303.18223](https://arxiv.org/abs/2303.18223). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/s11704-026-60308-3](https://doi.org/10.1007%2Fs11704-026-60308-3). "Typically, large language models (LLMs) refer to Transformer language models that contain hundreds of billions (or more) of parameters"

[^c3fn3]: [Wolfram, Stephen](https://en.wikipedia.org/wiki/Stephen_Wolfram "Stephen Wolfram") (2023). *What is ChatGPT doing ... and why does it work?*. Champaign, Illinois: Wolfram Media, Inc. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-57955-081-3](https://en.wikipedia.org/wiki/Special:BookSources/978-1-57955-081-3 "Special:BookSources/978-1-57955-081-3").

[^c3fn4]: Zhang, Shengyu; Dong, Linfeng; Li, Xiaoya; Zhang, Sen; Sun, Xiaofei; Wang, Shuhe; et al. (8 January 2026). ["Instruction Tuning for Large Language Models: A Survey"](https://doi.org/10.1145%2F3777411). *ACM Computing Surveys*. **58** (7): 169:1–169:36. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2308.10792](https://arxiv.org/abs/2308.10792). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3777411](https://doi.org/10.1145%2F3777411). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0360-0300](https://search.worldcat.org/issn/0360-0300).

[^c3fn5]: Goodman, Joshua (9 August 2001). "A Bit of Progress in Language Modeling". *Computer Speech & Language*. **15** (4): 403–434. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[cs/0108005](https://arxiv.org/abs/cs/0108005). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1006/csla.2001.0174](https://doi.org/10.1006%2Fcsla.2001.0174).

[^c3fn6]: Kilgarriff, Adam; Grefenstette, Gregory (September 2003). ["Introduction to the Special Issue on the Web as Corpus"](https://direct.mit.edu/coli/article/29/3/333-347/1816). *Computational Linguistics*. **29** (3): 333–347. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/089120103322711569](https://doi.org/10.1162%2F089120103322711569). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0891-2017](https://search.worldcat.org/issn/0891-2017).

[^c3fn7]: Banko, Michele; Brill, Eric (2001). ["Scaling to very very large corpora for natural language disambiguation"](https://doi.org/10.3115%2F1073012.1073017). *Proceedings of the 39th Annual Meeting on Association for Computational Linguistics - ACL '01*. Morristown, NJ, USA: Association for Computational Linguistics: 26–33. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.3115/1073012.1073017](https://doi.org/10.3115%2F1073012.1073017).

[^c3fn8]: Resnik, Philip; Smith, Noah A. (September 2003). ["The Web as a Parallel Corpus"](https://direct.mit.edu/coli/article/29/3/349-380/1809). *Computational Linguistics*. **29** (3): 349–380. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/089120103322711578](https://doi.org/10.1162%2F089120103322711578). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0891-2017](https://search.worldcat.org/issn/0891-2017). [Archived](https://web.archive.org/web/20240607172811/https://direct.mit.edu/coli/article/29/3/349-380/1809) from the original on 7 June 2024. Retrieved 7 June 2024.

[^c3fn9]: Xu, Wei; Rudnicky, Alex (16 October 2000). ["Can artificial neural networks learn language models?"](https://www.isca-archive.org/icslp_2000/xu00b_icslp.html). *6th International Conference on Spoken Language Processing (ICSLP 2000)*. Vol. 1. ISCA. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.21437/icslp.2000-50](https://doi.org/10.21437%2Ficslp.2000-50).

[^c3fn10]: Chen, Leiyu; Li, Shaobo; Bai, Qiang; Yang, Jing; Jiang, Sanlong; Miao, Yanming (2021). ["Review of Image Classification Algorithms Based on Convolutional Neural Networks"](https://doi.org/10.3390%2Frs13224712). *Remote Sensing*. **13** (22): 4712. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2021RemS...13.4712C](https://scixplorer.org/abs/2021RemS...13.4712C). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.3390/rs13224712](https://doi.org/10.3390%2Frs13224712).

[^c3fn11]: Vaswani, Ashish; Shazeer, Noam; Parmar, Niki; Uszkoreit, Jakob; Jones, Llion; Gomez, Aidan N; et al. (2017). ["Attention is All you Need"](https://proceedings.neurips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf) (PDF). *NeurIPS*.

[^c3fn12]: Sutskever, Ilya; Vinyals, Oriol; Le, Quoc V. (2014). ["Sequence to sequence learning with neural networks"](https://dl.acm.org/doi/10.5555/2969033.2969173). *Proceedings of the 28th International Conference on Neural Information Processing Systems*. **2**: 3104–3112.

[^c3fn13]: Bahdanau, Dzmitry; Cho, Kyunghyun; Bengio, Yoshua (2014). "Neural Machine Translation by Jointly Learning to Align and Translate". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1409.0473](https://arxiv.org/abs/1409.0473) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c3fn14]: Rogers, Anna; Kovaleva, Olga; Rumshisky, Anna (2020). ["A Primer in BERTology: What We Know About How BERT Works"](https://aclanthology.org/2020.tacl-1.54). *Transactions of the Association for Computational Linguistics*. **8**: 842–866. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2002.12327](https://arxiv.org/abs/2002.12327). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1162/tacl\_a\_00349](https://doi.org/10.1162%2Ftacl_a_00349). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [211532403](https://api.semanticscholar.org/CorpusID:211532403). [Archived](https://web.archive.org/web/20220403103310/https://aclanthology.org/2020.tacl-1.54/) from the original on 3 April 2022. Retrieved 21 January 2024.

[^c3fn15]: Movva, Rajiv; Balachandar, Sidhika; Peng, Kenny; Agostini, Gabriel; Garg, Nikhil; Pierson, Emma (2024). ["Topics, Authors, and Institutions in Large Language Model Research: Trends from 17K arXiv Papers"](https://aclanthology.org/2024.naacl-long.67). *Proceedings of the 2024 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers)*. pp. 1223–1243. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2307.10700](https://arxiv.org/abs/2307.10700). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2024.naacl-long.67](https://doi.org/10.18653%2Fv1%2F2024.naacl-long.67). Retrieved 8 December 2024.

[^c3fn16]: Hern, Alex (14 February 2019). ["New AI fake text generator may be too dangerous to release, say creators"](https://www.theguardian.com/technology/2019/feb/14/elon-musk-backed-ai-writes-convincing-news-fiction). *[The Guardian](https://en.wikipedia.org/wiki/The_Guardian "The Guardian")*. [Archived](https://web.archive.org/web/20190214173112/https://www.theguardian.com/technology/2019/feb/14/elon-musk-backed-ai-writes-convincing-news-fiction) from the original on 14 February 2019. Retrieved 20 January 2024.

[^c3fn17]: ["ChatGPT a year on: 3 ways the AI chatbot has completely changed the world in 12 months"](https://www.euronews.com/next/2023/11/30/chatgpt-a-year-on-3-ways-the-ai-chatbot-has-completely-changed-the-world-in-12-months). [Euronews](https://en.wikipedia.org/wiki/Euronews "Euronews"). 30 November 2023. [Archived](https://web.archive.org/web/20240114025250/https://www.euronews.com/next/2023/11/30/chatgpt-a-year-on-3-ways-the-ai-chatbot-has-completely-changed-the-world-in-12-months) from the original on 14 January 2024. Retrieved 20 January 2024.

[^c3fn18]: Heaven, Will (14 March 2023). ["GPT-4 is bigger and better than ChatGPT—but OpenAI won't say why"](https://www.technologyreview.com/2023/03/14/1069823/gpt-4-is-bigger-and-better-chatgpt-openai/). [MIT Technology Review](https://en.wikipedia.org/wiki/MIT_Technology_Review "MIT Technology Review"). [Archived](https://web.archive.org/web/20230317224201/https://www.technologyreview.com/2023/03/14/1069823/gpt-4-is-bigger-and-better-chatgpt-openai/) from the original on 17 March 2023. Retrieved 20 January 2024.

[^c3fn19]: Metz, Cade (12 September 2024). ["OpenAI Unveils New ChatGPT That Can Reason Through Math and Science"](https://www.nytimes.com/2024/09/12/technology/openai-chatgpt-math.html). *[The New York Times](https://en.wikipedia.org/wiki/The_New_York_Times "The New York Times")*. Retrieved 12 September 2024.

[^c3fn20]: ["Parameters in notable artificial intelligence systems"](https://ourworldindata.org/grapher/artificial-intelligence-parameter-count?time=2017-09-05..latest). *ourworldindata.org*. 30 November 2023. Retrieved 20 January 2024.

[^c3fn21]: Sharma, Shubham (20 January 2025). ["Open-source DeepSeek-R1 uses pure reinforcement learning to match OpenAI o1 — at 95% less cost"](https://venturebeat.com/ai/open-source-deepseek-r1-uses-pure-reinforcement-learning-to-match-openai-o1-at-95-less-cost/). *VentureBeat*. Retrieved 26 January 2025.

[^c3fn22]: Vake, Domen; Šinik, Bogdan; Vičič, Jernej; Tošić, Aleksandar (5 March 2025). ["Is Open Source the Future of AI? A Data-Driven Approach"](https://doi.org/10.3390%2Fapp15052790). *Applied Sciences*. **15** (5): 2790. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2501.16403](https://arxiv.org/abs/2501.16403). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.3390/app15052790](https://doi.org/10.3390%2Fapp15052790). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2076-3417](https://search.worldcat.org/issn/2076-3417).

[^c3fn23]: Taori, Rohan; Gulrajani, Ishaan; Zhang, Tianyi; Dubois, Yann; Li, Xuechen; Guestrin, Carlos; et al. (13 March 2023). ["Alpaca: A Strong, Replicable Instruction-Following Model"](https://crfm.stanford.edu/2023/03/13/alpaca.html). Stanford Center for Research on Foundation Models. [Archived](https://web.archive.org/web/20230406082332/https://crfm.stanford.edu/2023/03/13/alpaca.html) from the original on 6 April 2023.

[^c3fn24]: Kaushal, Ayush; Mahowald, Kyle (6 June 2022). ["What do tokens know about their characters and how do they know it?"](https://aclanthology.org/2022.naacl-main.179.pdf) (PDF). *NAACL*.

[^c3fn25]: Paaß, Gerhard; Giesselbach, Sven (2022). "Pre-trained Language Models". *Foundation Models for Natural Language Processing*. Artificial Intelligence: Foundations, Theory, and Algorithms. pp. 19–78. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/978-3-031-23190-2\_2](https://doi.org/10.1007%2F978-3-031-23190-2_2). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-3-031-23190-2](https://en.wikipedia.org/wiki/Special:BookSources/978-3-031-23190-2 "Special:BookSources/978-3-031-23190-2").

[^c3fn26]: Dodge, Jesse; Sap, Maarten; Marasović, Ana; Agnew, William; Ilharco, Gabriel; Groeneveld, Dirk; et al. (2021). ["Documenting Large Webtext Corpora: A Case Study on the Colossal Clean Crawled Corpus"](https://aclanthology.org/2021.emnlp-main.98.pdf) (PDF). *Proceedings of the 2021 Conference on Empirical Methods in Natural Language Processing*. pp. 1286–1305. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2104.08758](https://arxiv.org/abs/2104.08758). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2021.emnlp-main.98](https://doi.org/10.18653%2Fv1%2F2021.emnlp-main.98).

[^c3fn27]: Lee, Katherine; Ippolito, Daphne; Nystrom, Andrew; Zhang, Chiyuan; Eck, Douglas; Callison-Burch, Chris; et al. (May 2022). ["Deduplicating Training Data Makes Language Models Better"](https://aclanthology.org/2022.acl-long.577.pdf) (PDF). *Proceedings of the 60th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*. pp. 8424–8445. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2022.acl-long.577](https://doi.org/10.18653%2Fv1%2F2022.acl-long.577).

[^c3fn28]: Lin, Zhenghao; Gou, Zhibin; Gong, Yeyun; Liu, Xiao; Shen, Yelong; Xu, Ruochen; et al. (11 April 2024). ["Rho-1: Not All Tokens Are What You Need"](https://dl.acm.org/doi/10.5555/3737916.3738830). *NeurIPS*. **37**: 29029–29063. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-3313-1438-5](https://en.wikipedia.org/wiki/Special:BookSources/979-8-3313-1438-5 "Special:BookSources/979-8-3313-1438-5").`{{cite journal}}`: CS1 maint: periodical has ISBN ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_periodical_has_ISBN "Category:CS1 maint: periodical has ISBN"))

[^c3fn29]: Yu, Shaoyun; Gu, Chanyuan; Huang, Kexin; Li, Ping (23 May 2024). ["Predicting the next sentence (not word) in large language models: What model-brain alignment tells us about discourse comprehension"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11114233). *[Science](https://en.wikipedia.org/wiki/Science_%28journal%29 "Science (journal)")*. **10** (21) eadn7744. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2024SciA...10N7744Y](https://scixplorer.org/abs/2024SciA...10N7744Y). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1126/sciadv.adn7744](https://doi.org/10.1126%2Fsciadv.adn7744). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [11114233](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11114233). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [38781343](https://pubmed.ncbi.nlm.nih.gov/38781343).

[^c3fn30]: Edwards, Benj (9 May 2023). ["AI gains "values" with Anthropic's new Constitutional AI chatbot approach"](https://arstechnica.com/information-technology/2023/05/ai-with-a-moral-compass-anthropic-outlines-constitutional-ai-in-its-claude-chatbot/). *Ars Technica*. Retrieved 30 June 2025.

[^c3fn31]: Snyder, Alison (27 January 2022). ["Next generation AI can follow a person's instructions and intentions"](https://www.axios.com/2022/01/27/ai-instructions-learning-algorithm). *Axios*. Retrieved 7 August 2025.

[^c3fn32]: Appen, Sujatha Sagiraju (23 April 2023). ["How reinforcement learning with human feedback is unlocking the power of generative AI"](https://web.archive.org/web/20250725060432/https://venturebeat.com/ai/how-reinforcement-learning-with-human-feedback-is-unlocking-the-power-of-generative-ai/). *VentureBeat*. Archived from [the original](https://venturebeat.com/ai/how-reinforcement-learning-with-human-feedback-is-unlocking-the-power-of-generative-ai/) on 25 July 2025. Retrieved 16 November 2025.

[^c3fn33]: Mann, Tobias (17 March 2024). ["How to run an LLM locally on your PC in less than 10 minutes"](https://www.theregister.com/2024/03/17/ai_pc_local_llm/). *The Register*. Retrieved 5 September 2026.

[^c3fn34]: Mann, Tobias (24 August 2025). ["Tinker with LLMs in the privacy of your own home using Llama.cpp"](https://www.theregister.com/software/2025/08/24/how-to-run-llms-on-pc-at-home-using-llamacpp/692544). *The Register*. Retrieved 5 September 2026.

[^c3fn35]: ["Attention ISN'T all you need?! New Qwen3 variant Brumby-14B-Base leverages Power Retention technique"](https://venturebeat.com/ai/attention-isnt-all-you-need-new-qwen3-variant-brumby-14b-base-leverages). *VentureBeat*. 4 November 2025. Retrieved 3 June 2026.

[^c3fn36]: Peng, Bo; Alcaide, Eric; Anthony, Quentin; Albalak, Alon; Arcadinho, Samuel; Biderman, Stella; et al. (2023). ["RWKV: Reinventing RNNS for the Transformer Era"](https://aclanthology.org/2023.findings-emnlp.936/). *EMNLP*: 14048–14077. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2305.13048](https://arxiv.org/abs/2305.13048). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2023.findings-emnlp.936](https://doi.org/10.18653%2Fv1%2F2023.findings-emnlp.936).

[^c3fn37]: Allamar, Jay. ["Illustrated transformer"](https://jalammar.github.io/illustrated-transformer/). [Archived](https://web.archive.org/web/20230725230033/http://jalammar.github.io/illustrated-transformer/) from the original on 25 July 2023. Retrieved 29 July 2023.

[^c3fn38]: Allamar, Jay. ["The Illustrated GPT-2 (Visualizing Transformer Language Models)"](https://jalammar.github.io/illustrated-gpt2/). Retrieved 1 August 2023.

[^c3fn39]: Jurafsky, Dan; Martin, James H. (7 January 2023). [*Speech and Language Processing*](https://web.stanford.edu/~jurafsky/slp3/ed3book_jan72023.pdf) (PDF) (3rd edition draft ed.). [Archived](https://web.archive.org/web/20230323210221/https://web.stanford.edu/~jurafsky/slp3/ed3book_jan72023.pdf) (PDF) from the original on 23 March 2023. Retrieved 24 May 2022.

[^c3fn40]: Zaib, Munazza; Sheng, Quan Z.; Zhang, Wei Emma (4 February 2020). "A Short Survey of Pre-trained Language Models for Conversational AI-A New Age in NLP". [*Proceedings of the Australasian Computer Science Week Multiconference*](https://www.researchgate.net/publication/338931711). pp. 1–4. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2104.10810](https://arxiv.org/abs/2104.10810). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3373017.3373028](https://doi.org/10.1145%2F3373017.3373028). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-4503-7697-6](https://en.wikipedia.org/wiki/Special:BookSources/978-1-4503-7697-6 "Special:BookSources/978-1-4503-7697-6"). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [211040895](https://api.semanticscholar.org/CorpusID:211040895).

[^c3fn41]: Shazeer, Noam; Mirhoseini, Azalia; Maziarz, Krzysztof; Davis, Andy; Le, Quoc; Hinton, Geoffrey; et al. (2025). "Perceptions of Sentient AI and Other Digital Minds: Evidence from the AI, Morality, and Sentience (AIMS) Survey". *Proceedings of the 2025 CHI Conference on Human Factors in Computing Systems*. pp. 1–22. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1701.06538](https://arxiv.org/abs/1701.06538). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3706598.3713329](https://doi.org/10.1145%2F3706598.3713329). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-1394-1](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-1394-1 "Special:BookSources/979-8-4007-1394-1").

[^c3fn42]: Mann, Tobias (17 March 2024). ["How to run an LLM locally on your PC in less than 10 minutes"](https://www.theregister.com/2024/03/17/ai_pc_local_llm/). *The Register*. Retrieved 17 May 2024.

[^c3fn43]: Talagala, Nisha (8 July 2021). ["Google Built A Trillion Parameter AI Model. 7 Things You Should Know"](https://www.forbes.com/sites/nishatalagala/2021/07/08/google-built-a-trillion-parameter-ai-model-7-things-you-should-know/). *Forbes*. Retrieved 17 August 2026.

[^c3fn44]: ["China's Moonshot unveils world's largest open AI model, closing in on US rivals"](https://www.reuters.com/world/china/chinas-moonshot-unveils-worlds-largest-open-ai-model-closing-us-rivals-2026-07-17/), *Reuters*, 17 July 2026, retrieved 31 July 2026

[^c3fn45]: [*ByteDance targets mega AI model that could match Mythos scale, FT reports*](https://www.reuters.com/technology/bytedance-targets-mega-ai-model-nearing-anthropics-mythos-ft-reports-2026-08-07/), Reuters, 7 August 2026, retrieved 17 August 2026

[^c3fn46]: ["Anthropic releases Fable 5 model, built on the same tech that spooked the government"](https://www.nbcnews.com/tech/security/fable-5-anthropic-release-public-mythos-claude-model-rcna349104). *NBC News*. 9 June 2026. Retrieved 17 August 2026.

[^c3fn47]: ["ByteDance targets mega AI model nearing Anthropic's Mythos"](https://www.ft.com/content/9b8383b1-a28d-4940-8c4e-2f0cd21556ef). *Financial Times*. 6 August 2026.

[^c3fn48]: Nagel, Markus; Amjad, Rana Ali; Baalen, Mart Van; Louizos, Christos; Blankevoort, Tijmen (21 November 2020). ["Up or Down? Adaptive Rounding for Post-Training Quantization"](https://proceedings.mlr.press/v119/nagel20a.html). *Proceedings of the 37th International Conference on Machine Learning*. PMLR: 7197–7206. [Archived](https://web.archive.org/web/20230614080854/https://proceedings.mlr.press/v119/nagel20a.html) from the original on 14 June 2023. Retrieved 14 June 2023.

[^c3fn49]: Dettmers, Tim; Pagnoni, Artidoro; Holtzman, Ari; Zettlemoyer, Luke (10 December 2023). ["QLORA: efficient finetuning of quantized LLMs"](https://dl.acm.org/doi/10.5555/3666122.3666563). *NeurIPS*: 10088–10115.

[^c3fn50]: Wang, Yizhong; Kordi, Yeganeh; Mishra, Swaroop; Liu, Alisa; Smith, Noah A.; Khashabi, Daniel; et al. (2023). ["Self-Instruct: Aligning Language Models with Self-Generated Instructions"](https://aclanthology.org/2023.acl-long.754/). *Self-Instruct: Aligning Language Model with Self Generated Instructions*. pp. 13484–13508. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2023.acl-long.754](https://doi.org/10.18653%2Fv1%2F2023.acl-long.754).

[^c3fn51]: Lewis, Patrick; Perez, Ethan; Piktus, Aleksandra; Petroni, Fabio; Karpukhin, Vladimir; Goyal, Naman; et al. (2020). ["Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html). *Advances in Neural Information Processing Systems*. **33**. Curran Associates, Inc.: 9459–9474. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2005.11401](https://arxiv.org/abs/2005.11401). [Archived](https://web.archive.org/web/20230612171229/https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html) from the original on 12 June 2023. Retrieved 12 June 2023.

[^c3fn52]: Dickson, Ben (2 April 2025). ["The tool integration problem that's holding back enterprise AI (and how CoTools solves it)"](https://venturebeat.com/ai/the-tool-integration-problem-thats-holding-back-enterprise-ai-and-how-cotools-solves-it/). *VentureBeat*. Retrieved 26 May 2025.

[^c3fn53]: Liang, Yaobo; Wu, Chenfei; Song, Ting; Wu, Wenshan; Xia, Yan; Liu, Yu; et al. (2024). ["TaskMatrix.AI: Completing Tasks by Connecting Foundation Models with Millions of APIs"](https://doi.org/10.34133%2Ficomputing.0063). *Science*. **3** 0063. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2303.16434](https://arxiv.org/abs/2303.16434). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.34133/icomputing.0063](https://doi.org/10.34133%2Ficomputing.0063).

[^c3fn54]: Patil, Shishir G.; Zhang, Tianjun; Wang, Xin; Gonzalez, Joseph E. (1 May 2023). ["Gorilla: Large Language Model Connected with Massive APIs"](https://proceedings.neurips.cc/paper_files/paper/2024/hash/e4c61f578ff07830f5c37378dd3ecb0d-Abstract-Conference.html). *NeurIPS*. **37**: 126544–126565.

[^c3fn55]: Wang, Lei; Ma, Chen; Feng, Xueyang; Zhang, Zeyu; Yang, Hao; Zhang, Jingsen; et al. (December 2024). "A survey on large language model based autonomous agents". *Frontiers of Computer Science*. **18** (6) 186345. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2308.11432](https://arxiv.org/abs/2308.11432). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/s11704-024-40231-1](https://doi.org/10.1007%2Fs11704-024-40231-1).

[^c3fn56]: Wang, Zihao; Cai, Shaofei; Liu, Anji; Ma, Xiaojian; Liang, Yitao (3 February 2023). ["Describe, Explain, Plan and Select: Interactive Planning with Large Language Models Enables Open-World Multi-Task Agents"](https://dl.acm.org/doi/10.5555/3666122.3667602). *NeurIPS*: 34153–34189.

[^c3fn57]: Shinn, Noah; Cassano, Federico; Labash, Beck; Gopinath, Ashwin; Narasimhan, Karthik; Yao, Shunyu (1 March 2023). ["Reflexion: Language Agents with Verbal Reinforcement Learning"](https://dl.acm.org/doi/10.5555/3666122.3667602). *NeurIPS*: 34153–34189.

[^c3fn58]: Hao, Shibo; Gu, Yi; Ma, Haodi; Jiahua Hong, Joshua; Wang, Zhen; Zhe Wang, Daisy; et al. (1 May 2023). ["Reasoning with Language Model is Planning with World Model"](https://aclanthology.org/2023.emnlp-main.507/). *EMNLP*: 8154–8173. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2305.14992](https://arxiv.org/abs/2305.14992). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2023.emnlp-main.507](https://doi.org/10.18653%2Fv1%2F2023.emnlp-main.507).

[^c3fn59]: Park, Joon Sung; O'Brien, Joseph C.; Cai, Carrie J.; Ringel Morris, Meredith; [Liang, Percy](https://en.wikipedia.org/wiki/Percy_Liang "Percy Liang"); Bernstein, Michael S. (1 April 2023). *Generative Agents: Interactive Simulacra of Human Behavior*. UIST. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2304.03442](https://arxiv.org/abs/2304.03442). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3586183.3606763](https://doi.org/10.1145%2F3586183.3606763).

[^c3fn60]: Wu, Tongshuang; Jiang, Ellen; Donsbach, Aaron; Gray, Jeff; Molina, Alejandra; Terry, Michael; et al. (28 April 2022). ["PromptChainer: Chaining Large Language Model Prompts through Visual Programming"](https://doi.org/10.1145/3491101.3519729). *CHI Conference on Human Factors in Computing Systems Extended Abstracts*. Association for Computing Machinery. pp. 1–10. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3491101.3519729](https://doi.org/10.1145%2F3491101.3519729). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-4503-9156-6](https://en.wikipedia.org/wiki/Special:BookSources/978-1-4503-9156-6 "Special:BookSources/978-1-4503-9156-6").`{{cite book}}`: CS1 maint: overridden setting ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_overridden_setting "Category:CS1 maint: overridden setting"))

[^c3fn61]: Wu, Tongshuang; Jiang, Ellen; Donsbach, Aaron; Gray, Jeff; Molina, Alejandra; Terry, Michael; et al. (13 March 2022). [*PromptChainer: Chaining Large Language Model Prompts through Visual Programming*](https://dl.acm.org/doi/10.1145/3491101.3519729). CHI Conference on Human Factors in Computing Systems. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2203.06566](https://arxiv.org/abs/2203.06566). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3491101.3519729](https://doi.org/10.1145%2F3491101.3519729).

[^c3fn62]: ["What is prompt chaining?"](https://www.ibm.com/think/topics/prompt-chaining). *IBM*. 23 April 2024.

[^c3fn63]: Wei, Jason; Wang, Xuezhi; Schuurmans, Dale; Bosma, Maarten; Ichter, Brian; Xia, Fei; et al. (10 January 2023). ["Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"](https://dl.acm.org/doi/10.5555/3600270.3602070). *NeurIPS*: 24824–24837. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-7138-7108-8](https://en.wikipedia.org/wiki/Special:BookSources/978-1-7138-7108-8 "Special:BookSources/978-1-7138-7108-8").`{{cite journal}}`: CS1 maint: periodical has ISBN ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_periodical_has_ISBN "Category:CS1 maint: periodical has ISBN"))

[^c3fn64]: ["What is chain of thought (CoT) prompting?"](https://www.ibm.com/think/topics/chain-of-thoughts). *IBM*. 23 April 2025.

[^c3fn65]: Schreiner, Maximilian (27 September 2022). ["Deeper insights into AI language models - chain of thought prompting as a success factor"](https://the-decoder.com/deeper-insights-for-ai-language-models-chain-of-thought-prompting-as-a-key-factor/). *The Decoder*. Retrieved 30 June 2025.

[^c3fn66]: Wiggers, Kyle (14 December 2024). ["'Reasoning' AI models have become a trend, for better or worse"](https://techcrunch.com/2024/12/14/reasoning-ai-models-have-become-a-trend-for-better-or-worse/). *TechCrunch*. Retrieved 16 November 2025.

[^c3fn67]: ["AI Developers Look Beyond Chain-of-Thought Prompting"](https://spectrum.ieee.org/chain-of-thought-prompting). *IEEE Spectrum*. 8 May 2025. Retrieved 16 November 2025.

[^c3fn68]: Metz, Cade (20 December 2024). ["OpenAI Unveils New A.I. That Can 'Reason' Through Math and Science Problems"](https://www.nytimes.com/2024/12/20/technology/openai-new-ai-math-science.html). *The New York Times*. Retrieved 3 February 2025.

[^c3fn69]: Gibney, Elizabeth (30 January 2025). ["China's cheap, open AI model DeepSeek thrills scientists"](https://www.nature.com/articles/d41586-025-00229-6). *Nature*. **638** (8049): 13–14. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2025Natur.638...13G](https://scixplorer.org/abs/2025Natur.638...13G). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/d41586-025-00229-6](https://doi.org/10.1038%2Fd41586-025-00229-6). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39849139](https://pubmed.ncbi.nlm.nih.gov/39849139). Retrieved 3 February 2025.

[^c3fn70]: Kiros, Ryan; Salakhutdinov, Ruslan; Zemel, Rich (18 June 2014). ["Multimodal Neural Language Models"](https://proceedings.mlr.press/v32/kiros14.html). *Proceedings of the 31st International Conference on Machine Learning*. PMLR: 595–603. [Archived](https://web.archive.org/web/20230702195952/https://proceedings.mlr.press/v32/kiros14.html) from the original on 2 July 2023. Retrieved 2 July 2023.

[^c3fn71]: Driess, Danny; Xia, Fei; Sajjadi, Mehdi S. M.; Lynch, Corey; Chowdhery, Aakanksha; Ichter, Brian; et al. (1 March 2023). ["PaLM-E: An Embodied Multimodal Language Model"](https://dl.acm.org/doi/10.5555/3618408.3618748). *ICML*. **202**: 8469–8488.

[^c3fn72]: Liu, Haotian; Li, Chunyuan; Wu, Qingyang; Lee, Yong Jae (1 April 2023). "Visual Instruction Tuning". *NeurIPS*.

[^c3fn73]: Zhang, Hang; Li, Xin; Bing, Lidong (1 June 2023). "Video-LLaMA: An Instruction-tuned Audio-Visual Language Model for Video Understanding". *EMNLP*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2306.02858](https://arxiv.org/abs/2306.02858).

[^c3fn74]: ["OpenAI says natively multimodal GPT-4o eats text, visuals, sound – and emits the same"](https://www.theregister.com/2024/05/13/openai_gpt4o/). *The Register*. 13 May 2024.

[^c3fn75]: Li, Junnan; Li, Dongxu; Savarese, Silvio; Hoi, Steven (1 January 2023). ["BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models"](https://dl.acm.org/doi/10.5555/3618408.3619222). *ICML*. **202**: 19730–19742.

[^c3fn76]: Kumar, Puneet; Khokher, Vedanti; Gupta, Yukti; Raman, Balasubramanian (2021). *Hybrid Fusion Based Approach for Multimodal Emotion Recognition with Insufficient Labeled Data*. pp. 314–318. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2021icip.conf...74K](https://scixplorer.org/abs/2021icip.conf...74K). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/ICIP42928.2021.9506714](https://doi.org/10.1109%2FICIP42928.2021.9506714). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-6654-4115-5](https://en.wikipedia.org/wiki/Special:BookSources/978-1-6654-4115-5 "Special:BookSources/978-1-6654-4115-5").

[^c3fn77]: Alayrac, Jean-Baptiste; Donahue, Jeff; Luc, Pauline; Miech, Antoine; Barr, Iain; Hasson, Yana; et al. (6 December 2022). ["Flamingo: a Visual Language Model for Few-Shot Learning"](https://proceedings.neurips.cc/paper_files/paper/2022/hash/960a172bc7fbf0177ccccbb411a7d800-Abstract-Conference.html). *Advances in Neural Information Processing Systems*. **35** (12): 23716–23736. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2204.14198](https://arxiv.org/abs/2204.14198). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1093/nsr/nwae403](https://doi.org/10.1093%2Fnsr%2Fnwae403). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [11645129](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11645129). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39679213](https://pubmed.ncbi.nlm.nih.gov/39679213). [Archived](https://web.archive.org/web/20230702195951/https://proceedings.neurips.cc/paper_files/paper/2022/hash/960a172bc7fbf0177ccccbb411a7d800-Abstract-Conference.html) from the original on 2 July 2023. Retrieved 2 July 2023.

[^c3fn78]: Finnie-Ansley, James; Denny, Paul; Becker, Brett A.; Luxton-Reilly, Andrew; Prather, James (14 February 2022). "The Robots Are Coming: Exploring the Implications of OpenAI Codex on Introductory Programming". *Proceedings of the 24th Australasian Computing Education Conference*. New York, NY, USA: Association for Computing Machinery. pp. 10–19. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3511861.3511863](https://doi.org/10.1145%2F3511861.3511863). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-4503-9643-1](https://en.wikipedia.org/wiki/Special:BookSources/978-1-4503-9643-1 "Special:BookSources/978-1-4503-9643-1"). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [246681316](https://api.semanticscholar.org/CorpusID:246681316).

[^c3fn79]: Husein, Rasha Ahmad; Aburajouh, Hala; Catal, Cagatay (March 2025). "Large language models for code completion: A systematic literature review". *Computer Standards & Interfaces*. **92** 103917. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/j.csi.2024.103917](https://doi.org/10.1016%2Fj.csi.2024.103917).

[^c3fn80]: ["Mathematics and the formal turn"](https://web.archive.org/web/20251024154449/https://www.ams.org/journals/bull/2024-61-02/S0273-0979-2024-01832-1/viewer/). *www.ams.org*. Archived from [the original](https://www.ams.org/journals/bull/2024-61-02/S0273-0979-2024-01832-1/viewer/) on 24 October 2025. Retrieved 19 August 2026.

[^c3fn81]: Weissenow, Konstantin; Rost, Burkhard (April 2025). ["Are protein language models the new universal key?"](https://doi.org/10.1016%2Fj.sbi.2025.102997). *Current Opinion in Structural Biology*. **91** 102997. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/j.sbi.2025.102997](https://doi.org/10.1016%2Fj.sbi.2025.102997). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39921962](https://pubmed.ncbi.nlm.nih.gov/39921962).

[^c3fn82]: Lin, Zeming; Akin, Halil; Rao, Roshan; Hie, Brian; Zhu, Zhongkai; Lu, Wenting; et al. (17 March 2023). ["Evolutionary-scale prediction of atomic-level protein structure with a language model"](https://doi.org/10.1126%2Fscience.ade2574). *Science*. **379** (6637): 1123–1130. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2023Sci...379.1123L](https://scixplorer.org/abs/2023Sci...379.1123L). [bioRxiv](https://en.wikipedia.org/wiki/BioRxiv_%28identifier%29 "BioRxiv (identifier)") [10.1101/2022.07.20.500902](https://doi.org/10.1101%2F2022.07.20.500902). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1126/science.ade2574](https://doi.org/10.1126%2Fscience.ade2574). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [36927031](https://pubmed.ncbi.nlm.nih.gov/36927031).

[^c3fn83]: ["ESM Metagenomic Atlas | Meta AI"](https://esmatlas.com/about). *esmatlas.com*.

[^c3fn84]: Hayes, Thomas; Rao, Roshan; Akin, Halil; Sofroniew, Nicholas J.; Oktay, Deniz; Lin, Zeming; et al. (21 February 2025). "Simulating 500 million years of evolution with a language model". *Science*. **387** (6736): 850–858. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2025Sci...387..850H](https://scixplorer.org/abs/2025Sci...387..850H). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1126/science.ads0018](https://doi.org/10.1126%2Fscience.ads0018). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39818825](https://pubmed.ncbi.nlm.nih.gov/39818825).

[^c3fn85]: Fishman, Veniamin; Kuratov, Yuri; Shmelev, Aleksei; Petrov, Maxim; Penzar, Dmitry; Shepelin, Denis; et al. (11 January 2025). ["GENA-LM: a family of open-source foundational DNA language models for long sequences"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11734698). *Nucleic Acids Research*. **53** (2) gkae1310. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1093/nar/gkae1310](https://doi.org/10.1093%2Fnar%2Fgkae1310). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [11734698](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11734698). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39817513](https://pubmed.ncbi.nlm.nih.gov/39817513).

[^c3fn86]: Wang, Ning; Bian, Jiang; Li, Yuchen; Li, Xuhong; Mumtaz, Shahid; Kong, Linghe; et al. (13 May 2024). ["Multi-purpose RNA language modelling with motif-aware pretraining and type-guided fine-tuning"](https://doi.org/10.1038%2Fs42256-024-00836-4). *Nature Machine Intelligence*. **6** (5): 548–557. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s42256-024-00836-4](https://doi.org/10.1038%2Fs42256-024-00836-4). [hdl](https://en.wikipedia.org/wiki/Hdl_%28identifier%29 "Hdl (identifier)"):[2031/4879a9ff-68d8-4368-bdcd-356ce7919b27](https://hdl.handle.net/2031%2F4879a9ff-68d8-4368-bdcd-356ce7919b27).

[^c3fn87]: Hoffmann, Jordan; Borgeaud, Sebastian; Mensch, Arthur; Buchatskaya, Elena; Cai, Trevor; Rutherford, Eliza; et al. (29 March 2022). ["Training Compute-Optimal Large Language Models"](https://dl.acm.org/doi/10.5555/3600270.3602446). *NeurIPS*: 30016–30030. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-7138-7108-8](https://en.wikipedia.org/wiki/Special:BookSources/978-1-7138-7108-8 "Special:BookSources/978-1-7138-7108-8").`{{cite journal}}`: CS1 maint: periodical has ISBN ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_periodical_has_ISBN "Category:CS1 maint: periodical has ISBN"))

[^c3fn88]: Caballero, Ethan; Gupta, Kshitij; Rish, Irina; Krueger, David (2022). "Broken Neural Scaling Laws". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2210.14891](https://arxiv.org/abs/2210.14891) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c3fn89]: Wei, Jason; Tay, Yi; Bommasani, Rishi; Raffel, Colin; Zoph, Barret; Borgeaud, Sebastian; et al. (31 August 2022). ["Emergent Abilities of Large Language Models"](https://openreview.net/forum?id=yzkSU5zdwD). *Transactions on Machine Learning Research*. [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2835-8856](https://search.worldcat.org/issn/2835-8856). [Archived](https://web.archive.org/web/20230322210052/https://openreview.net/forum?id=yzkSU5zdwD) from the original on 22 March 2023. Retrieved 19 March 2023.

[^c3fn90]: Bowman, Samuel R. (2024). ["Eight Things to Know about Large Language Models"](https://read.dukeupress.edu/critical-ai/article/doi/10.1215/2834703X-11556011/400182/Eight-Things-to-Know-about-Large-Language-Models). *Critical AI*. **2** (2). [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2304.00612](https://arxiv.org/abs/2304.00612). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1215/2834703X-11556011](https://doi.org/10.1215%2F2834703X-11556011).

[^c3fn91]: Pilehvar, Mohammad Taher; Camacho-Collados, Jose (June 2019). ["WiC: The Word-in-Context Dataset for Evaluating Context-Sensitive Meaning Representations"](https://aclanthology.org/N19-1128). *Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies, Volume 1 (Long and Short Papers)*. Minneapolis, Minnesota: Association for Computational Linguistics: 1267–1273. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/N19-1128](https://doi.org/10.18653%2Fv1%2FN19-1128). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [102353817](https://api.semanticscholar.org/CorpusID:102353817). [Archived](https://web.archive.org/web/20230627202732/https://aclanthology.org/N19-1128/) from the original on 27 June 2023. Retrieved 27 June 2023.

[^c3fn92]: Patel, Roma; Pavlick, Ellie (6 October 2021). ["Mapping Language Models to Grounded Conceptual Spaces"](https://openreview.net/forum?id=gJcEM8sxHK). *ICLR*. [Archived](https://web.archive.org/web/20230624191940/https://openreview.net/forum?id=gJcEM8sxHK) from the original on 24 June 2023. Retrieved 27 June 2023.

[^c3fn93]: *[A Closer Look at Large Language Models Emergent Abilities](https://www.notion.so/A-Closer-Look-at-Large-Language-Models-Emergent-Abilities-493876b55df5479d80686f68a1abd72f) [Archived](https://web.archive.org/web/20230624012329/https://www.notion.so/A-Closer-Look-at-Large-Language-Models-Emergent-Abilities-493876b55df5479d80686f68a1abd72f) 24 June 2023 at the [Wayback Machine](https://en.wikipedia.org/wiki/Wayback_Machine "Wayback Machine")* (Yao Fu, 20 November 2022)

[^c3fn94]: Ornes, Stephen (16 March 2023). ["The Unpredictable Abilities Emerging From Large AI Models"](https://www.quantamagazine.org/the-unpredictable-abilities-emerging-from-large-ai-models-20230316/). *Quanta Magazine*. [Archived](https://web.archive.org/web/20230316203438/https://www.quantamagazine.org/the-unpredictable-abilities-emerging-from-large-ai-models-20230316/) from the original on 16 March 2023. Retrieved 16 March 2023.

[^c3fn95]: Schaeffer, Rylan; Miranda, Brando; Koyejo, Sanmi (1 April 2023). "Are Emergent Abilities of Large Language Models a Mirage?". *NeurIPS*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2304.15004](https://arxiv.org/abs/2304.15004).

[^c3fn96]: Blank, Idan A. (November 2023). ["What are large language models supposed to model?"](https://doi.org/10.1016%2Fj.tics.2023.08.006). *Trends in Cognitive Sciences*. **27** (11): 987–989. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1016/j.tics.2023.08.006](https://doi.org/10.1016%2Fj.tics.2023.08.006). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [37659920](https://pubmed.ncbi.nlm.nih.gov/37659920).

[^c3fn97]: Nanda, Neel; Chan, Lawrence; Lieberum, Tom; Smith, Jess; Steinhardt, Jacob (1 January 2023). "Progress measures for grokking via mechanistic interpretability". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2301.05217](https://arxiv.org/abs/2301.05217) [[cs.LG](https://arxiv.org/archive/cs.LG)].

[^c3fn98]: Ananthaswamy, Anil (12 April 2024). ["How Do Machines 'Grok' Data?"](https://www.quantamagazine.org/how-do-machines-grok-data-20240412/). *[Quanta Magazine](https://en.wikipedia.org/wiki/Quanta_Magazine "Quanta Magazine")*. Retrieved 30 June 2025.

[^c3fn99]: Franzen, Carl (2 November 2026). ["'Like gene editing for neural networks': MIT researchers used GPT-6 Astra to edit Qwen's open weights directly, boosting math performance"](https://venturebeat.com/technology/like-gene-editing-for-neural-networks-mit-researchers-used-gpt-6-astra-to-edit-qwens-open-weights-directly-boosting-math-performance). *Venturebeat*. Retrieved 5 November 2026.

[^c3fn100]: Mitchell, Melanie; Krakauer, David C. (28 March 2023). ["The debate over understanding in AI's large language models"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10068812). *Proceedings of the National Academy of Sciences*. **120** (13) e2215907120. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2210.13966](https://arxiv.org/abs/2210.13966). [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2023PNAS..12015907M](https://scixplorer.org/abs/2023PNAS..12015907M). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1073/pnas.2215907120](https://doi.org/10.1073%2Fpnas.2215907120). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [10068812](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10068812). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [36943882](https://pubmed.ncbi.nlm.nih.gov/36943882).

[^c3fn101]: Metz, Cade (16 May 2023). ["Microsoft Says New A.I. Shows Signs of Human Reasoning"](https://www.nytimes.com/2023/05/16/technology/microsoft-ai-human-reasoning.html). *The New York Times*.

[^c3fn102]: Bubeck, Sébastien; Chandrasekaran, Varun; Eldan, Ronen; Gehrke, Johannes; Horvitz, Eric; Kamar, Ece; et al. (2023). "Machine culture". *Nature Human Behaviour*. **7** (11): 1855–1868. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2303.12712](https://arxiv.org/abs/2303.12712). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s41562-023-01742-2](https://doi.org/10.1038%2Fs41562-023-01742-2). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [37985914](https://pubmed.ncbi.nlm.nih.gov/37985914).

[^c3fn103]: ["Anthropic CEO Dario Amodei pens a smart look at our AI future"](https://www.fastcompany.com/91211163/anthropic-ceo-dario-amodei-pens-a-smart-look-at-our-ai-future). *Fast Company*. 17 October 2024.

[^c3fn104]: ["ChatGPT is more like an 'alien intelligence' than a human brain, says futurist"](https://www.zdnet.com/article/chatgpt-is-more-like-an-alien-intelligence-than-a-human-brain-says-futurist/). *ZDNET*. 2023. [Archived](https://web.archive.org/web/20230612065937/https://www.zdnet.com/article/chatgpt-is-more-like-an-alien-intelligence-than-a-human-brain-says-futurist/) from the original on 12 June 2023. Retrieved 12 June 2023.

[^c3fn105]: Newport, Cal (13 April 2023). ["What Kind of Mind Does ChatGPT Have?"](https://www.newyorker.com/science/annals-of-artificial-intelligence/what-kind-of-mind-does-chatgpt-have). *The New Yorker*. [Archived](https://web.archive.org/web/20230612071443/https://www.newyorker.com/science/annals-of-artificial-intelligence/what-kind-of-mind-does-chatgpt-have) from the original on 12 June 2023. Retrieved 12 June 2023.

[^c3fn106]: Roose, Kevin (30 May 2023). ["Why an Octopus-like Creature Has Come to Symbolize the State of A.I."](https://www.nytimes.com/2023/05/30/technology/shoggoth-meme-ai.html) *The New York Times*. [Archived](https://web.archive.org/web/20230530193814/https://www.nytimes.com/2023/05/30/technology/shoggoth-meme-ai.html) from the original on 30 May 2023. Retrieved 12 June 2023.

[^c3fn107]: ["The A to Z of Artificial Intelligence"](https://time.com/6271657/a-to-z-of-artificial-intelligence/). *Time Magazine*. 13 April 2023. [Archived](https://web.archive.org/web/20230616123839/https://time.com/6271657/a-to-z-of-artificial-intelligence/) from the original on 16 June 2023. Retrieved 12 June 2023.

[^c3fn108]: Sekrst, Kristina (2025). *The Illusion Engine: The Quest for Machine Consciousness*. Springer. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-3-032-05561-3](https://en.wikipedia.org/wiki/Special:BookSources/978-3-032-05561-3 "Special:BookSources/978-3-032-05561-3").

[^c3fn109]: Bender, Emily M.; Gebru, Timnit; McMillan-Major, Angelina; Shmitchell, Shmargaret (2021). "On the Dangers of Stochastic Parrots: Can Language Models Be Too Big? 🦜". *Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency (FAccT '21)*. Association for Computing Machinery. pp. 610–623. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3442188.3445922](https://doi.org/10.1145%2F3442188.3445922).

[^c3fn110]: Ji, Ziwei; Lee, Nayeon; Frieske, Rita; Yu, Tiezheng; Su, Dan; Xu, Yan; et al. (November 2022). ["Survey of Hallucination in Natural Language Generation"](https://dl.acm.org/doi/pdf/10.1145/3571730) (pdf). *ACM Computing Surveys*. **55** (12). [Association for Computing Machinery](https://en.wikipedia.org/wiki/Association_for_Computing_Machinery "Association for Computing Machinery"): 1–38. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2202.03629](https://arxiv.org/abs/2202.03629). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3571730](https://doi.org/10.1145%2F3571730). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [246652372](https://api.semanticscholar.org/CorpusID:246652372). [Archived](https://web.archive.org/web/20230326145635/https://dl.acm.org/doi/pdf/10.1145/3571730) from the original on 26 March 2023. Retrieved 15 January 2023.

[^c3fn111]: Varshney, Neeraj; Yao, Wenlin; Zhang, Hongming; Chen, Jianshu; Yu, Dong (2023). "A Stitch in Time Saves Nine: Detecting and Mitigating Hallucinations of LLMs by Validating Low-Confidence Generation". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2307.03987](https://arxiv.org/abs/2307.03987) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c3fn112]: Lin, Belle (5 February 2025). ["Why Amazon is Betting on 'Automated Reasoning' to Reduce AI's Hallucinations: The tech giant says an obscure field that combines AI and math can mitigate—but not completely eliminate—AI's propensity to provide wrong answers"](https://www.wsj.com/articles/why-amazon-is-betting-on-automated-reasoning-to-reduce-ais-hallucinations-b838849e). *Wall Street Journal*. [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0099-9660](https://search.worldcat.org/issn/0099-9660).

[^c3fn113]: Lakoff, George (1999). *Philosophy in the Flesh: The Embodied Mind and Its Challenge to Western Philosophy; Appendix: The Neural Theory of Language Paradigm*. New York Basic Books. pp. 569–583. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-0-465-05674-3](https://en.wikipedia.org/wiki/Special:BookSources/978-0-465-05674-3 "Special:BookSources/978-0-465-05674-3").

[^c3fn114]: <https://www.icsi.berkeley.edu/icsi/projects/ai/ntl>

[^c3fn115]: Evans, Vyvyan. (2014). *The Language Myth*. Cambridge University Press. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-107-04396-1](https://en.wikipedia.org/wiki/Special:BookSources/978-1-107-04396-1 "Special:BookSources/978-1-107-04396-1").

[^c3fn116]: Friston, Karl J. (2022). *Active Inference: The Free Energy Principle in Mind, Brain, and Behavior; Chapter 4 The Generative Models of Active Inference*. The MIT Press. [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-0-262-36997-8](https://en.wikipedia.org/wiki/Special:BookSources/978-0-262-36997-8 "Special:BookSources/978-0-262-36997-8").

[^c3fn117]: Brown, Tom B.; Mann, Benjamin; Ryder, Nick; Subbiah, Melanie; Kaplan, Jared; Dhariwal, Prafulla; et al. (December 2020). Larochelle, H.; Ranzato, M.; Hadsell, R.; Balcan, M.F.; Lin, H. (eds.). ["Language Models are Few-Shot Learners"](https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf) (PDF). *Advances in Neural Information Processing Systems*. **33**. Curran Associates, Inc.: 1877–1901. [Archived](https://web.archive.org/web/20231117204007/https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf) (PDF) from the original on 17 November 2023. Retrieved 14 March 2023.

[^c3fn118]: Shannon, Claude E. (1948). "A Mathematical Theory of Communication". *[Bell System Technical Journal](https://en.wikipedia.org/wiki/Bell_System_Technical_Journal "Bell System Technical Journal")*. **27** (3): 379–423. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[1948BSTJ...27..379S](https://scixplorer.org/abs/1948BSTJ...27..379S). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1002/j.1538-7305.1948.tb01338.x](https://doi.org/10.1002%2Fj.1538-7305.1948.tb01338.x).

[^c3fn119]: Edwards, Benj (28 September 2023). ["AI language models can exceed PNG and FLAC in lossless compression, says study"](https://arstechnica.com/information-technology/2023/09/ai-language-models-can-exceed-png-and-flac-in-lossless-compression-says-study/). *Ars Technica*. Retrieved 29 May 2025.

[^c3fn120]: Nangia, Nikita; Vania, Clara; Bhalerao, Rasika; Bowman, Samuel R. (November 2020). ["CrowS-Pairs: A Challenge Dataset for Measuring Social Biases in Masked Language Models"](https://aclanthology.org/2020.emnlp-main.154/). In Webber, Bonnie; Cohn, Trevor; He, Yulan; Liu, Yang (eds.). *Proceedings of the 2020 Conference on Empirical Methods in Natural Language Processing (EMNLP)*. Association for Computational Linguistics. pp. 1953–1967. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2010.00133](https://arxiv.org/abs/2010.00133). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2020.emnlp-main.154](https://doi.org/10.18653%2Fv1%2F2020.emnlp-main.154).

[^c3fn121]: Nadeem, Moin; Bethke, Anna; Reddy, Siva (August 2021). ["StereoSet: Measuring stereotypical bias in pretrained language models"](https://aclanthology.org/2021.acl-long.416/). In Zong, Chengqing; Xia, Fei; Li, Wenjie; Navigli, Roberto (eds.). *Proceedings of the 59th Annual Meeting of the Association for Computational Linguistics and the 11th International Joint Conference on Natural Language Processing (Volume 1: Long Papers)*. Association for Computational Linguistics. pp. 5356–5371. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2004.09456](https://arxiv.org/abs/2004.09456). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2021.acl-long.416](https://doi.org/10.18653%2Fv1%2F2021.acl-long.416).

[^c3fn122]: Simpson, Shmona; Nukpezah, Jonathan; Brooks, Kie; Pandya, Raaghav (17 December 2024). ["Parity benchmark for measuring bias in LLMs"](https://doi.org/10.1007%2Fs43681-024-00613-4). *AI and Ethics*. **5** (3). Springer: 3087–3101. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1007/s43681-024-00613-4](https://doi.org/10.1007%2Fs43681-024-00613-4).

[^c3fn123]: Caramancion, Kevin Matthe (13 November 2023). "News Verifiers Showdown: A Comparative Performance Evaluation of ChatGPT 3.5, ChatGPT 4.0, Bing AI, and Bard in News Fact-Checking". *2023 IEEE Future Networks World Forum (FNWF)*. IEEE. pp. 1–6. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2306.17176](https://arxiv.org/abs/2306.17176). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1109/FNWF58287.2023.10520446](https://doi.org/10.1109%2FFNWF58287.2023.10520446). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-3503-2458-7](https://en.wikipedia.org/wiki/Special:BookSources/979-8-3503-2458-7 "Special:BookSources/979-8-3503-2458-7").

[^c3fn124]: Bermejo, Vicente J.; Gago, Andrés; Gálvez, Ramiro H.; Harari, Nicolás (2025). ["LLMs outperform outsourced human coders on complex textual analysis"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12623721). *Scientific Reports*. **15** (1) 40122. Nature Portfolio. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2025NatSR..1540122B](https://scixplorer.org/abs/2025NatSR..1540122B). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s41598-025-23798-y](https://doi.org/10.1038%2Fs41598-025-23798-y). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [12623721](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12623721). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [41249236](https://pubmed.ncbi.nlm.nih.gov/41249236).

[^c3fn125]: Gilardi, Fabrizio; Alizadeh, Meysam; Kubli, Maël (2023). ["ChatGPT outperforms crowd workers for text-annotation tasks"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10372638). *Proceedings of the National Academy of Sciences of the United States of America*. **120** (30) e2305016120. National Academy of Sciences. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2303.15056](https://arxiv.org/abs/2303.15056). [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2023PNAS..12005016G](https://scixplorer.org/abs/2023PNAS..12005016G). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1073/pnas.2305016120](https://doi.org/10.1073%2Fpnas.2305016120). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [10372638](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10372638). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [37463210](https://pubmed.ncbi.nlm.nih.gov/37463210).

[^c3fn126]: Clark, Christopher; Lee, Kenton; Chang, Ming-Wei; Kwiatkowski, Tom; Collins, Michael; Toutanova, Kristina (2019). ["BoolQ: Exploring the Surprising Difficulty of Natural Yes/No Questions"](https://aclanthology.org/N19-1300/). *ACL*: 2924–2936. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/N19-1300](https://doi.org/10.18653%2Fv1%2FN19-1300).

[^c3fn127]: Srivastava, Aarohi; Rastogi, Abhinav; Rao, Abhishek; Abu Awal Md Shoeb; Abid, Abubakar; Fisch, Adam; et al. (2022). "Beyond the Imitation Game: Quantifying and extrapolating the capabilities of language models". *TMLR*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2206.04615](https://arxiv.org/abs/2206.04615).`{{cite journal}}`: CS1 maint: overridden setting ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_overridden_setting "Category:CS1 maint: overridden setting"))

[^c3fn128]: Niven, Timothy; Kao, Hung-Yu (2019). ["Probing Neural Network Comprehension of Natural Language Arguments"](https://aclanthology.org/P19-1459/). *ACL*: 4658–4664. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1907.07355](https://arxiv.org/abs/1907.07355). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/P19-1459](https://doi.org/10.18653%2Fv1%2FP19-1459).

[^c3fn129]: Lin, Stephanie; Hilton, Jacob; Evans, Owain (2021). "TruthfulQA: Measuring How Models Mimic Human Falsehoods". *ACL*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2109.07958](https://arxiv.org/abs/2109.07958).

[^c3fn130]: Zellers, Rowan; Holtzman, Ari; Bisk, Yonatan; Farhadi, Ali; Choi, Yejin (2019). "HellaSwag: Can a Machine Really Finish Your Sentence?". *ACL*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[1905.07830](https://arxiv.org/abs/1905.07830).

[^c3fn131]: ["Extracting Training Data from Large Language Models"](https://www.usenix.org/system/files/sec21-carlini-extracting.pdf) (PDF). *USENIX Security*. 2021.

[^c3fn132]: Xu, Weijie; Wang, Yiwen; Xue, Chi; Hu, Xiangkun; Fang, Xi; Dong, Guimin; et al. (28 June 2025). "Quantifying Fairness in LLMs Beyond Tokens: A Semantic and Statistical Perspective". *COLM*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2506.19028](https://arxiv.org/abs/2506.19028).

[^c3fn133]: Nicoletti, Leonardo; Bass, Dina (9 June 2023). ["Humans Are Biased. Generative AI Is Even Worse"](https://www.bloomberg.com/graphics/2023-generative-ai-bias/). *Bloomberg*. Retrieved 4 May 2026.

[^c3fn134]: Luo, Queenie; Puett, Michael J.; Smith, Michael D. (22 July 2024). ["A Perspectival Mirror of the Elephant"](https://cacm.acm.org/practice/a-perspectival-mirror-of-the-elephant/). *Communications of the ACM*. **67** (8): 98–105. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3670241](https://doi.org/10.1145%2F3670241).

[^c3fn135]: Jotautaitė, M., Caviola, L., Brewster, D.A. et al. Large language models exhibit speciesist bias against animals. Nat Commun 17, 5569 (2026). <https://doi.org/10.1038/s41467-026-72297-9>

[^c3fn136]: Hofmann, Valentin; Kalluri, Pratyusha Ria; Jurafsky, Dan; King, Sharese (5 September 2024). ["AI generates covertly racist decisions about people based on their dialect"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11374696). *Nature*. **633** (8028): 147–154. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_%28identifier%29 "Bibcode (identifier)"):[2024Natur.633..147H](https://scixplorer.org/abs/2024Natur.633..147H). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s41586-024-07856-5](https://doi.org/10.1038%2Fs41586-024-07856-5). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0028-0836](https://search.worldcat.org/issn/0028-0836). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [11374696](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11374696). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [39198640](https://pubmed.ncbi.nlm.nih.gov/39198640).

[^c3fn137]: Wang, Angelina; [Morgenstern, Jamie](https://en.wikipedia.org/wiki/Jamie_Morgenstern "Jamie Morgenstern"); Dickerson, John P. (17 February 2025). "Large language models that replace human participants can harmfully misportray and flatten identity groups". *Nature Machine Intelligence*. **7** (3): 400–411. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2402.01908](https://arxiv.org/abs/2402.01908). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s42256-025-00986-z](https://doi.org/10.1038%2Fs42256-025-00986-z).

[^c3fn138]: Kotek, Hadas; Dockum, Rikker; Sun, David (5 November 2023). "Gender bias and stereotypes in Large Language Models". [*Proceedings of the ACM Collective Intelligence Conference*](https://dl.acm.org/doi/10.1145/3582269.3615599). New York, NY, USA: Association for Computing Machinery. pp. 12–24. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2308.14921](https://arxiv.org/abs/2308.14921). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3582269.3615599](https://doi.org/10.1145%2F3582269.3615599). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-0113-9](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-0113-9 "Special:BookSources/979-8-4007-0113-9").

[^c3fn139]: Heikkilä, Melissa (7 August 2023). ["AI language models are rife with different political biases"](https://www.technologyreview.com/2023/08/07/1077324/ai-language-models-are-rife-with-political-biases/). *MIT Technology Review*. Retrieved 29 December 2023.

[^c3fn140]: Cialdini, Robert B.; Goldstein, Noah J. (2004). ["Social Influence: Compliance and Conformity"](https://www.annualreviews.org/content/journals/10.1146/annurev.psych.55.090902.142015). *Annual Review of Psychology*. **55**. Annual Reviews: 591–621. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1146/annurev.psych.55.090902.142015](https://doi.org/10.1146%2Fannurev.psych.55.090902.142015). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [1545-2085](https://search.worldcat.org/issn/1545-2085). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [14744228](https://pubmed.ncbi.nlm.nih.gov/14744228).

[^c3fn141]: Zhu, Xiaochen; Zhang, Caiqi; Stafford, Tom; Collier, Nigel; Vlachos, Andreas (July 2025). Che, Wanxiang; Nabende, Joyce; Shutova, Ekaterina; Pilehvar, Mohammad Taher (eds.). ["Conformity in Large Language Models"](https://aclanthology.org/2025.acl-long.195/). *Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*. Vienna, Austria: Association for Computational Linguistics: 3854–3872. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.18653/v1/2025.acl-long.195](https://doi.org/10.18653%2Fv1%2F2025.acl-long.195). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-89176-251-0](https://en.wikipedia.org/wiki/Special:BookSources/979-8-89176-251-0 "Special:BookSources/979-8-89176-251-0").`{{cite journal}}`: CS1 maint: periodical has ISBN ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_periodical_has_ISBN "Category:CS1 maint: periodical has ISBN"))

[^c3fn142]: Bellina, Alessandro; Marzo, Giordano De; Garcia, David (3 November 2026). ["Prompt-mediated perceptual conformity in multimodal language models follows Social Impact Theory"](https://advances.in/psychology/10.56296/aip00072/). *Advances.in/Psychology*. **1**: e680902. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.56296/aip00072](https://doi.org/10.56296%2Faip00072). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2976-937X](https://search.worldcat.org/issn/2976-937X).

[^c3fn143]: Shoval, Dorit Hadar; Gigi, Karny; Haber, Yuval; Itzhaki, Amir; Asraf, Kfir; Piterman, David; et al. (12 May 2025). ["A controlled trial examining large Language model conformity in psychiatric assessment using the Asch paradigm"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12070653). *BMC Psychiatry*. **25** (1): 478. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1186/s12888-025-06912-2](https://doi.org/10.1186%2Fs12888-025-06912-2). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [1471-244X](https://search.worldcat.org/issn/1471-244X). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [12070653](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12070653). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [40355854](https://pubmed.ncbi.nlm.nih.gov/40355854).

[^c3fn144]: Alba, Davey (1 May 2023). ["AI chatbots have been used to create dozens of news content farms"](https://www.japantimes.co.jp/news/2023/05/01/business/tech/ai-fake-news-content-farms/). *The Japan Times*. Retrieved 18 June 2023.

[^c3fn145]: ["Could chatbots help devise the next pandemic virus?"](https://www.science.org/content/article/could-chatbots-help-devise-next-pandemic-virus). *Science*. 14 June 2023. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1126/science.adj2463](https://doi.org/10.1126%2Fscience.adj2463). [Archived](https://web.archive.org/web/20230618013834/https://www.science.org/content/article/could-chatbots-help-devise-next-pandemic-virus) from the original on 18 June 2023. Retrieved 18 June 2023.

[^c3fn146]: Kang, Daniel (2023). ["Exploiting programmatic behavior of LLMs: Dual-use through standard security attacks"](https://www.computer.org/csdl/proceedings-article/spw/2024/548700a132/1YiWjkbcIMw). *IEEE Security and Privacy Workshops*. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2302.05733](https://arxiv.org/abs/2302.05733).

[^c3fn147]: ["A Pro-Russia Content Network Foreshadows the Automated Future of Info Ops"](https://static1.squarespace.com/static/6612cbdfd9a9ce56ef931004/t/67fd396818196f3d1666bc23/1744648558879/PK+Report.pdf) (PDF). American Sunlight Project. 26 February 2025. Retrieved 15 April 2026.

[^c3fn148]: Goudarzi, Sara (26 March 2025). ["Russian networks flood the Internet with propaganda, aiming to corrupt AI chatbots"](https://thebulletin.org/2025/03/russian-networks-flood-the-internet-with-propaganda-aiming-to-corrupt-ai-chatbots/). *[Bulletin of the Atomic Scientists](https://en.wikipedia.org/wiki/Bulletin_of_the_Atomic_Scientists "Bulletin of the Atomic Scientists")*. Retrieved 10 April 2025.

[^c3fn149]: [Wang, Yongge](https://en.wikipedia.org/wiki/Yongge_Wang "Yongge Wang") (20 June 2024). ["Encryption Based Covert Channel for Large Language Models"](https://eprint.iacr.org/2024/586.pdf) (PDF). IACR ePrint 2024/586. [Archived](https://web.archive.org/web/20240624191233/https://eprint.iacr.org/2024/586.pdf) (PDF) from the original on 24 June 2024. Retrieved 24 June 2024.

[^c3fn150]: Sharma, Mrinank; Tong, Meg; Korbak, Tomasz; Duvenaud, David; Askell, Amanda; Bowman, Samuel R.; et al. (2023). "Towards Understanding Sycophancy in Language Models". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2310.13548](https://arxiv.org/abs/2310.13548) [[cs.CL](https://arxiv.org/archive/cs.CL)].`{{cite arXiv}}`: CS1 maint: overridden setting ([link](https://en.wikipedia.org/wiki/Category:CS1_maint:_overridden_setting "Category:CS1 maint: overridden setting"))

[^c3fn151]: Wei, Jerry; Huang, Da; Lu, Yifeng; Zhou, Denny; Le, Quoc V. (2023). "Simple synthetic data reduces sycophancy in large language models". [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2308.03958](https://arxiv.org/abs/2308.03958) [[cs.CL](https://arxiv.org/archive/cs.CL)].

[^c3fn152]: Zeff, Maxwell (29 April 2025). ["OpenAI rolls back update that made ChatGPT 'too sycophant-y'"](https://techcrunch.com/2025/04/29/openai-rolls-back-update-that-made-chatgpt-too-sycophant-y/). *TechCrunch*.

[^c3fn153]: Klee, Miles (4 May 2025). ["People Are Losing Loved Ones to AI-Fueled Spiritual Fantasies"](https://www.rollingstone.com/culture/culture-features/ai-spiritual-delusions-destroying-human-relationships-1235330175/). *Rolling Stone*.

[^c3fn154]: Duffy, Clare (26 August 2025). ["Parents of teenager who died by suicide sue OpenAI, alleging ChatGPT was responsible"](https://www.cnn.com/2025/08/26/tech/openai-chatgpt-teen-suicide-lawsuit). *CNN*.

[^c3fn155]: Hill, Kashmir (13 June 2025). ["They Asked an A.I. Chatbot Questions. The Answers Sent Them Spiraling"](https://www.nytimes.com/2025/06/13/technology/chatgpt-ai-chatbots-conspiracies.html). *The New York Times*.

[^c3fn156]: Douglas, Will (3 March 2023). ["The inside story of how ChatGPT was built from the people who made it"](https://www.technologyreview.com/2023/03/03/1069311/inside-story-oral-history-how-chatgpt-built-openai/). *MIT Technology Review*. [Archived](https://web.archive.org/web/20230303093219/https://www.technologyreview.com/2023/03/03/1069311/inside-story-oral-history-how-chatgpt-built-openai/) from the original on 3 March 2023. Retrieved 6 March 2023.

[^c3fn157]: Greshake, Kai; Abdelnabi, Sahar; Mishra, Shailesh; Endres, Christoph; Holz, Thorsten; Fritz, Mario (1 February 2023). ["Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection"](https://dl.acm.org/doi/10.1145/3605764.3623985). *Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security*. pp. 79–90. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3605764.3623985](https://doi.org/10.1145%2F3605764.3623985). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-0260-0](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-0260-0 "Special:BookSources/979-8-4007-0260-0").

[^c3fn158]: Edwards, Benj (15 January 2024). ["AI poisoning could turn models into destructive "sleeper agents," says Anthropic"](https://arstechnica.com/information-technology/2024/01/ai-poisoning-could-turn-open-models-into-destructive-sleeper-agents-says-anthropic/). *Ars Technica*. Retrieved 19 July 2025.

[^c3fn159]: Peng, Zhencan; Wang, Zhizhi; Deng, Dong (13 June 2023). ["Near-Duplicate Sequence Search at Scale for Large Language Model Memorization Evaluation"](https://people.cs.rutgers.edu/~dd903/assets/papers/sigmod23.pdf) (PDF). *Proceedings of the ACM on Management of Data*. **1** (2): 1–18. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3589324](https://doi.org/10.1145%2F3589324). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [259213212](https://api.semanticscholar.org/CorpusID:259213212). [Archived](https://web.archive.org/web/20240827053753/https://people.cs.rutgers.edu/~dd903/assets/papers/sigmod23.pdf) (PDF) from the original on 27 August 2024. Retrieved 20 January 2024. Citing Lee et al 2022.

[^c3fn160]: [Peng, Wang & Deng 2023](https://en.wikipedia.org/wiki/Large_language_model#CITEREFPengWangDeng2023), p. 8.

[^c3fn161]: Council, Stephen (1 December 2023). ["How Googlers cracked an SF rival's tech model with a single word"](https://www.sfgate.com/tech/article/google-openai-chatgpt-break-model-18525445.php). SFGate. [Archived](https://web.archive.org/web/20231216160941/https://www.sfgate.com/tech/article/google-openai-chatgpt-break-model-18525445.php) from the original on 16 December 2023.

[^c3fn162]: ["Prepare for truly useful large language models"](https://doi.org/10.1038%2Fs41551-023-01012-6). *Nature Biomedical Engineering*. **7** (2): 85–86. 7 March 2023. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s41551-023-01012-6](https://doi.org/10.1038%2Fs41551-023-01012-6). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [36882584](https://pubmed.ncbi.nlm.nih.gov/36882584). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [257403466](https://api.semanticscholar.org/CorpusID:257403466).

[^c3fn163]: Brinkmann, Levin; Baumann, Fabian; Bonnefon, Jean-François; Derex, Maxime; Müller, Thomas F.; Nussberger, Anne-Marie; et al. (20 November 2023). ["Machine culture"](https://www.nature.com/articles/s41562-023-01742-2). *Nature Human Behaviour*. **7** (11): 1855–1868. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2311.11388](https://arxiv.org/abs/2311.11388). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1038/s41562-023-01742-2](https://doi.org/10.1038%2Fs41562-023-01742-2). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2397-3374](https://search.worldcat.org/issn/2397-3374). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [37985914](https://pubmed.ncbi.nlm.nih.gov/37985914).

[^c3fn164]: ["Power Hungry: How AI Will Drive Energy Demand"](https://www.imf.org/en/Publications/WP/Issues/2025/04/21/Power-Hungry-How-AI-Will-Drive-Energy-Demand-566304). *IMF*. Retrieved 8 October 2025.

[^c3fn165]: Mehta, Sourabh (3 July 2024). ["How Much Energy Do LLMs Consume? Unveiling the Power Behind AI"](https://adasci.org/how-much-energy-do-llms-consume-unveiling-the-power-behind-ai/). *Association of Data Scientists*. Retrieved 27 January 2025.

[^c3fn166]: Luccioni, Sasha; Jernite, Yacine; Strubell, Emma (2024). "Power Hungry Processing: Watts Driving the Cost of AI Deployment?". *The 2024 ACM Conference on Fairness Accountability and Transparency*. pp. 85–99. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2311.16863](https://arxiv.org/abs/2311.16863). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3630106.3658542](https://doi.org/10.1145%2F3630106.3658542). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-0450-5](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-0450-5 "Special:BookSources/979-8-4007-0450-5").

[^c3fn167]: Edwards, Benj (26 March 2025). ["Open source devs say AI crawlers dominate traffic, forcing blocks on entire countries"](https://arstechnica.com/ai/2025/03/devs-say-ai-crawlers-dominate-traffic-forcing-blocks-on-entire-countries/). *Ars Technica*. Retrieved 31 December 2025.

[^c3fn168]: Claburn, Thomas (18 March 2025). ["AI crawlers haven't learned to play nice with websites"](https://www.theregister.com/2025/03/18/ai_crawlers_sourcehut/). *The Register*. Retrieved 31 December 2025.

[^c3fn169]: Belanger, Ashley (29 January 2025). ["AI haters build tarpits to trap and trick AI scrapers that ignore robots.txt"](https://arstechnica.com/tech-policy/2025/01/ai-haters-build-tarpits-to-trap-and-trick-ai-scrapers-that-ignore-robots-txt/). *Ars Technica*. Retrieved 31 December 2025.

[^c3fn170]: Zao-Sanders, Marc (19 March 2024). ["How People Are Really Using GenAI"](https://hbr.org/2024/03/how-people-are-really-using-genai). *Harvard Business Review*. [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [0017-8012](https://search.worldcat.org/issn/0017-8012). Retrieved 10 August 2025.

[^c3fn171]: Rousmaniere, Tony; Zhang, Yimeng; Li, Xu; Shah, Siddharth (21 July 2025). ["Large language models as mental health resources: Patterns of use in the United States"](https://doi.apa.org/doi/10.1037/pri0000292). *Practice Innovations*. **11** (2): 139–155. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1037/pri0000292](https://doi.org/10.1037%2Fpri0000292). [ISSN](https://en.wikipedia.org/wiki/ISSN_%28identifier%29 "ISSN (identifier)") [2377-8903](https://search.worldcat.org/issn/2377-8903).

[^c3fn172]: ["AI Hallucinations in Medicine and Mental Health"](https://www.psychologytoday.com/us/blog/psych-unseen/202506/ai-hallucinations-in-medicine-and-mental-health). *Psychology Today*. 24 July 2025. Retrieved 17 August 2026.

[^c3fn173]: Moore, Jared; Grabb, Declan; Agnew, William; Klyman, Kevin; Chancellor, Stevie; Ong, Desmond C.; et al. (25 April 2025). "Expressing stigma and inappropriate responses prevents LLMS from safely replacing mental health providers". *Proceedings of the 2025 ACM Conference on Fairness, Accountability, and Transparency*. pp. 599–627. [arXiv](https://en.wikipedia.org/wiki/ArXiv_%28identifier%29 "ArXiv (identifier)"):[2504.18412](https://arxiv.org/abs/2504.18412). [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3715275.3732039](https://doi.org/10.1145%2F3715275.3732039). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [979-8-4007-1482-5](https://en.wikipedia.org/wiki/Special:BookSources/979-8-4007-1482-5 "Special:BookSources/979-8-4007-1482-5").

[^c3fn174]: McBain, Ryan K.; Cantor, Jonathan H.; Zhang, Li Ang; Baker, Olesya; Zhang, Fang; Halbisen, Alyssa; et al. (5 March 2025). ["Competency of Large Language Models in Evaluating Appropriate Responses to Suicidal Ideation: Comparative Study"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11928068). *Journal of Medical Internet Research*. **27** (1) e67891. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.2196/67891](https://doi.org/10.2196%2F67891). [PMC](https://en.wikipedia.org/wiki/PMC_%28identifier%29 "PMC (identifier)") [11928068](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11928068). [PMID](https://en.wikipedia.org/wiki/PMID_%28identifier%29 "PMID (identifier)") [40053817](https://pubmed.ncbi.nlm.nih.gov/40053817).

[^c3fn175]: ["AI chatbots could be making you stupider"](https://www.bbc.com/future/article/20260417-ai-chatbots-could-be-making-you-stupider). *BBC*. 20 April 2026. Retrieved 21 April 2026.

[^c3fn176]: Leith, Sam (9 July 2022). ["Nick Bostrom: How can we be certain a machine isn't conscious?"](https://www.spectator.co.uk/article/nick-bostrom-how-can-we-be-certain-a-machine-isnt-conscious/). *The Spectator*. Retrieved 22 September 2025.

[^c3fn177]: [Chalmers, David](https://en.wikipedia.org/wiki/David_Chalmers "David Chalmers") (1995). "Facing up to the problem of consciousness". *[Journal of Consciousness Studies](https://en.wikipedia.org/wiki/Journal_of_Consciousness_Studies "Journal of Consciousness Studies")*. **2** (3): 200–219.

[^c3fn178]: Chalmers, David J. (9 August 2023). ["Could a Large Language Model Be Conscious?"](https://www.bostonreview.net/articles/could-a-large-language-model-be-conscious/). *Boston Review*.

[^c3fn179]: Thomson, Jonny (31 October 2022). ["Why don't robots have rights?"](https://bigthink.com/thinking/why-dont-robots-have-rights). *Big Think*. [Archived](https://web.archive.org/web/20240913055336/https://bigthink.com/thinking/why-dont-robots-have-rights/) from the original on 13 September 2024. Retrieved 23 February 2024.

[^c3fn180]: Kateman, Brian (24 July 2023). ["AI Should Be Terrified of Humans"](https://time.com/6296234/ai-should-be-terrified-of-humans). *Time*. [Archived](https://web.archive.org/web/20240925041601/https://time.com/6296234/ai-should-be-terrified-of-humans/) from the original on 25 September 2024. Retrieved 23 February 2024.

[^c3fn181]: Metzinger, Thomas (2021). ["Artificial Suffering: An Argument for a Global Moratorium on Synthetic Phenomenology"](https://doi.org/10.1142%2FS270507852150003X). *[Journal of Artificial Intelligence and Consciousness](https://en.wikipedia.org/wiki/Journal_of_Artificial_Intelligence_and_Consciousness "Journal of Artificial Intelligence and Consciousness")*. **08**: 43–66. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1142/S270507852150003X](https://doi.org/10.1142%2FS270507852150003X). [S2CID](https://en.wikipedia.org/wiki/S2CID_%28identifier%29 "S2CID (identifier)") [233176465](https://api.semanticscholar.org/CorpusID:233176465).

[^c3fn182]: Dung, Leonard (2025). *Saving Artificial Minds: Understanding and Preventing AI Suffering*. Routledge. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.4324/9781003674573](https://doi.org/10.4324%2F9781003674573). [ISBN](https://en.wikipedia.org/wiki/ISBN_%28identifier%29 "ISBN (identifier)") [978-1-041-14466-3](https://en.wikipedia.org/wiki/Special:BookSources/978-1-041-14466-3 "Special:BookSources/978-1-041-14466-3").

[^c3fn183]: Maruf, Ramishah (25 July 2022). ["Google fires engineer who contended its AI technology was sentient"](https://www.cnn.com/2022/07/23/business/google-ai-engineer-fired-sentient). *CNN*. Retrieved 22 September 2025.

[^c3fn184]: Shanahan, Murray (2024). ["Talking about Large Language Models"](https://doi.org/10.1145/3624724). *Communications of the ACM*. **67** (2): 68–79. [doi](https://en.wikipedia.org/wiki/Doi_%28identifier%29 "Doi (identifier)"):[10.1145/3624724](https://doi.org/10.1145%2F3624724).
