# Sources {.front-matter}

- [Transformer (deep learning architecture)](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture))
- [Attention (machine learning)](https://en.wikipedia.org/wiki/Attention_(machine_learning))
- [Large language model](https://en.wikipedia.org/wiki/Large_language_model)

# Transformer (deep learning architecture) {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture))* | *Author: Wikipedia contributors*
:::

![A standard transformer architecture, showing on the left an encoder, and on the right a decoder. Note: this uses the pre-LN convention, which is different from the post-LN convention used in the original 2017 transformer.](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/Transformer%2C_full_architecture.png/250px-Transformer%2C_full_architecture.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In [deep learning](https://en.wikipedia.org/wiki/Deep_learning "Deep learning"), the **transformer** is a family of [artificial neural network](https://en.wikipedia.org/wiki/Artificial_neural_network "Artificial neural network") architectures based on the multi-head [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism, in which input data such as text, images, or audio is converted to a sequence of numerical representations called [tokens](https://en.wikipedia.org/wiki/Large_language_model#Tokenization "Large language model"), and each token is converted into a vector through an embedding layer. At each layer, each [token](https://en.wikipedia.org/wiki/Tokenization_%28lexical_analysis%29 "Tokenization (lexical analysis)") is then [contextualized](https://en.wikipedia.org/wiki/Contextualization_%28computer_science%29 "Contextualization (computer science)") within the scope of the [context window](https://en.wikipedia.org/wiki/Context_window "Context window") with other (unmasked) tokens via a parallel multi-head attention mechanism, allowing the signal for key tokens to be amplified and less important tokens to be diminished. Because self-attention alone is permutation-invariant, transformers inject positional information, typically through [positional encodings](https://en.wikipedia.org/wiki/Positional_encoding "Positional encoding") or learned positional embeddings, so token order can affect the output.

Because transformers do not process tokens one at a time, their computations can be parallelized across sequence positions during training more readily than those of recurrent neural networks like [long short-term memory](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (LSTM). Later variations have been widely adopted for training [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model") (LLMs) on large (language) [datasets](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets "Training, validation, and test data sets").

The original version of the transformer architecture was proposed in the 2017 paper "[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")" by researchers at [Google](https://en.wikipedia.org/wiki/Google "Google"). The predecessors of transformers were developed as an improvement over previous architectures for [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"), but have found many applications since. They are used in large-scale [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), [computer vision](https://en.wikipedia.org/wiki/Computer_vision "Computer vision") ([vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer")), [reinforcement learning](https://en.wikipedia.org/wiki/Reinforcement_learning "Reinforcement learning"), [audio](https://en.wikipedia.org/wiki/Audio_signal_processing "Audio signal processing"), [multimodal learning](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning"), [robotics](https://en.wikipedia.org/wiki/Robotics "Robotics"), and playing [chess](https://en.wikipedia.org/wiki/Computer_chess "Computer chess"). It has also led to the development of [pre-trained systems](https://en.wikipedia.org/wiki/Transfer_learning "Transfer learning"), such as [generative pre-trained transformers](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") (GPTs).

## History

### Predecessors

Before transformers, [recurrent neural networks](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network") (RNNs) were widely used for sequence modelling and generation. A well-cited early example was the [Elman network](https://en.wikipedia.org/wiki/Elman_network "Elman network") (1990). In theory, the information from one token can propagate arbitrarily far down the sequence, but in practice the [vanishing-gradient problem](https://en.wikipedia.org/wiki/Vanishing-gradient_problem "Vanishing-gradient problem") leaves the model's state at the end of a long sentence without precise, extractable information about preceding tokens.

A key breakthrough was [LSTM](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (originally described in a 1995 technical report and formally published in 1997), an RNN that introduced gating mechanisms to mitigate the vanishing gradient problem, allowing efficient learning of long-sequence modelling. One key architectural element was the use of *multiplicative gating units*, in which the outputs of some neurons modulate the outputs of others. These multiplicative units are conceptually distinct from the additive attention mechanism later introduced for sequence-to-sequence models.
Neural networks using multiplicative units were later called *sigma-pi networks* or *[higher-order networks](https://en.wikipedia.org/wiki/Higher-order_neural_network?action=edit&redlink=1 "Higher-order neural network")*. LSTM became the standard architecture for long sequence modelling until the 2017 publication of transformers. However, LSTM still used sequential processing, like most other RNNs. Specifically, RNNs operate one token at a time from first to last; they cannot operate in parallel over all tokens in a sequence.

Transformers allow parallel processing of tokens during training, but standard self-attention has computational and memory costs that grow quadratically with sequence length.

### Attention with seq2seq

The idea of encoder–decoder sequence transduction had been developed in the early 2010s; commonly cited as the originators that produced seq2seq are two concurrently published papers from 2014.

A 380M-parameter model for machine translation uses two [long short-term memories](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory") (LSTM). Its architecture consists of two parts. The *encoder* is an LSTM that takes in a sequence of tokens and turns it into a vector. The *decoder* is another LSTM that converts the vector into a sequence of tokens. Similarly, another 130M-parameter model used [gated recurrent units](https://en.wikipedia.org/wiki/Gated_recurrent_unit "Gated recurrent unit") (GRU) instead of LSTM. Later research showed that GRUs are neither better nor worse than LSTMs for seq2seq.

These early seq2seq models had no attention mechanism, and the state vector is accessible only after the *last* word of the source text was processed. Although in theory such a vector retains the information about the whole original sentence, in practice the information is poorly preserved. This is because the input is processed sequentially by one recurrent network into a *fixed*-size output vector, which is then processed by another recurrent network into an output. If the input is long, then the output vector would not be able to contain all relevant information, degrading the output. As evidence, reversing the input sentence improved seq2seq translation.

The *RNN search* model introduced an attention mechanism to seq2seq for machine translation to solve the bottleneck problem (of the *fixed-size* output vector), allowing the model to process long-distance dependencies more easily. The name is because it "emulates searching through a source sentence during decoding a translation".

The relative performances were compared between global (that of *RNN search*) and local (sliding window) attention model architectures for machine translation, finding that mixed attention had higher quality than global attention, while local attention reduced translation time.

In 2016, [Google Translate](https://en.wikipedia.org/wiki/Google_Translate "Google Translate") was revamped to [Google Neural Machine Translation](https://en.wikipedia.org/wiki/Google_Neural_Machine_Translation "Google Neural Machine Translation"), which replaced the previous model based on [statistical machine translation](https://en.wikipedia.org/wiki/Statistical_machine_translation "Statistical machine translation"). The new model was a seq2seq model where the encoder and the decoder were both 8 layers of bidirectional LSTM. It took nine months to develop, and it outperformed the statistical approach, which took ten years to develop.

### Parallelizing attention

Seq2seq models with attention (including self-attention) still suffered from the same issue with recurrent networks, which is that they are hard to [parallelize](https://en.wikipedia.org/wiki/Parallel_computing "Parallel computing"), which prevented them from being accelerated on GPUs. In 2016, *decomposable attention* applied a self-attention mechanism to [feedforward networks](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network"), which are easy to parallelize, and achieved state-of-the-art ([SOTA](https://en.wikipedia.org/wiki/State_of_the_art "State of the art")) results in [textual entailment](https://en.wikipedia.org/wiki/Textual_entailment "Textual entailment") with an order of magnitude fewer parameters than LSTMs. One of its authors, Jakob Uszkoreit, suspected that attention *without* recurrence would be sufficient for language translation, thus the title "attention is *All* you need". That hypothesis was against conventional wisdom at the time, and even his father [Hans Uszkoreit](https://en.wikipedia.org/wiki/Hans_Uszkoreit "Hans Uszkoreit"), a well-known computational linguist, was skeptical. In the same year, self-attention (called *intra-attention or* *intra-sentence attention*) was proposed for LSTMs.

On 2017-06-12, the original (100M-parameter) encoder–decoder transformer model was published in the "[Attention is All you need](https://en.wikipedia.org/wiki/Attention_is_all_you_need "Attention is all you need")" paper. At the time, the focus of the research was on improving [seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq") for [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"), by removing its recurrence to process all tokens in parallel, but preserving its dot-product attention mechanism to keep its text processing performance. This led to the introduction of a multi-head attention model that was easier to parallelize due to the use of independent heads and the lack of recurrence. Its parallelizability was an important factor to its widespread use in large neural networks.

### AI boom era

In spring 2017, before the "Attention is All you need" preprint was published, one of the co-authors applied the "decoder-only" variation of the architecture to generate fictitious Wikipedia articles. Transformer architecture is now used alongside many [generative models](https://en.wikipedia.org/wiki/Generative_AI "Generative AI") that contribute to the ongoing [AI boom](https://en.wikipedia.org/wiki/AI_boom "AI boom").

The "reference implementation" of the original Transformer was written in a TensorFlow library. In language modelling, [ELMo](https://en.wikipedia.org/wiki/ELMo "ELMo") (2018) was a bi-directional LSTM that produces contextualized [word embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding"), improving upon the line of research from [bag of words](https://en.wikipedia.org/wiki/Bag-of-words_model "Bag-of-words model") and [word2vec](https://en.wikipedia.org/wiki/Word2vec "Word2vec"). It was followed by [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") (2018), an encoder-only transformer model. In October 2019, Google started using BERT to process search queries. In 2020, Google Translate replaced the previous RNN-encoder–RNN-decoder model by a transformer-encoder–RNN-decoder model.

Starting in 2018, the OpenAI [GPT series](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") of decoder-only transformers became state of the art in [natural language generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation"). At the end of 2022, [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT"), a chatbot based on a fine-tuned variant of GPT-3.5, became unexpectedly popular, triggering a boom around [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model").

Transformers have been applied in modalities beyond text. Four days after the publication of "Attention is All You Need", a [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning") transformer architecture, MultiModel, was published by most authors of that paper. Other examples include the [vision transformer](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer"), which has led to developments in [convolutional neural networks](https://en.wikipedia.org/wiki/Convolutional_neural_network "Convolutional neural network"). Image and video generators like [DALL-E](https://en.wikipedia.org/wiki/DALL-E "DALL-E") (2021), [Stable Diffusion 3](https://en.wikipedia.org/wiki/Stable_Diffusion "Stable Diffusion") (2024), and [Sora](https://en.wikipedia.org/wiki/Sora_%28text-to-video_model%29 "Sora (text-to-video model)") (2024), use transformers to analyse input data (like text prompts) by breaking it down into "tokens" and then calculating the relevance between each token using self-attention, which helps the model simulate the context and relationships within the data.

## Training

### Methods for stabilizing training

The plain transformer architecture had difficulty in converging. In the original paper, the authors recommended using [learning rate](https://en.wikipedia.org/wiki/Learning_rate "Learning rate") warmup. That is, the learning rate should linearly scale up from 0 to maximal value for the first part of the training (usually recommended to be 2% of the total number of training steps), before decaying again.

A 2020 paper found that using [layer normalization](https://en.wikipedia.org/wiki/Layer_normalization "Layer normalization") *before* (instead of after) multihead attention and feedforward layers stabilizes training, not requiring learning rate warmup. This is the "pre-LN Transformer" and is more commonly used, compared to the original "post-LN Transformer".

### Regularization

The original transformer used dropout during training to reduce overfitting. Dropout was applied to the output of each sublayer before its residual connection and normalization, as well as to the sums of token embeddings and positional encodings. The original paper also used label smoothing, which replaces a certain target distribution with one that assigns a small amount of probability to alternative tokens. These techniques can improve generalization by going against overconfidence in the training targets.

### Distributed Training

Large transformer models are typically trained across multiple GPUs or other accelerators because their parameters, activations, and training data may not fit on a single device. Data parallelism copies the model across devices and splits different batches of training examples among them; gradients are then synchronized before parameters are updated. Model parallelism divides a model itself across devices. Tensor parallelism splits operations within individual layers, while pipeline parallelism assigns consecutive groups of layers to different devices.

### Pretrain-finetune

Transformers typically are first pretrained by [self-supervised learning](https://en.wikipedia.org/wiki/Self-supervised_learning "Self-supervised learning") on a large generic dataset, followed by [supervised](https://en.wikipedia.org/wiki/Supervised_learning "Supervised learning") [fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)") on a small task-specific dataset. The pretrain dataset is typically an unlabeled large corpus, such as [The Pile](https://en.wikipedia.org/wiki/The_Pile_%28dataset%29 "The Pile (dataset)"). Tasks for pretraining and fine-tuning commonly include:

- [reading comprehension](https://en.wikipedia.org/wiki/Natural-language_understanding "Natural-language understanding")
- [sentiment analysis](https://en.wikipedia.org/wiki/Sentiment_analysis "Sentiment analysis")
- [paraphrasing](https://en.wikipedia.org/wiki/Text_Summaries "Text Summaries")

The [T5 transformer](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") report documents a large number of [natural language](https://en.wikipedia.org/wiki/Natural_language "Natural language") pretraining tasks. Some examples are:

- restoring or repairing incomplete or corrupted text. For example, the input, *"Thank you ~~ me to your party ~~ week",* might generate the output, *"Thank you **for inviting** me to your party **last** week".*
- translation between natural languages ([machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation"))
- judging the pragmatic acceptability of natural language. For example, the following sentence might be judged "not acceptable", because even though it is syntactically well-formed, it is improbable in ordinary human usage: *The course is jumping well.*

While each of these tasks is trivial or obvious for human native speakers of the language (or languages), they have typically proved challenging for previous generations of machine learning architecture.

### Knowledge distillation

Knowledge distillation is a method for training a smaller model, called a "student", to reproduce the output behavior of a larger "teacher" model. In transformer models, the student can be trained using the teacher's output probability distribution, intermediate representations, or attention patterns in addition to the original training labels. Distillation can lower computational and memory requirements of deployment while keeping most of the teacher model's performance on a specified task.

### Tasks

In general, there are three classes of language modelling tasks: "masked", "autoregressive", and "prefixLM". These classes are independent of a specific modeling architecture such as transformer, but they are often discussed in the context of transformer.

In a masked task, one or more of the tokens is masked out, and the model would produce a probability distribution predicting what the masked-out tokens are based on the context. The [loss function](https://en.wikipedia.org/wiki/Loss_function "Loss function") for the task is typically sum of [log-perplexities](https://en.wikipedia.org/wiki/Perplexity "Perplexity") for the masked-out tokens: $$\text{Loss} = -\sum_{t\in\text{masked tokens}}\ln(\text{probability of }t\text{ conditional on its context})$$and the model is trained to minimize this loss function. The [BERT series of models](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") are trained for masked token prediction and another task. ("Masked" as in "masked language modelling" is not "masked" as in "[masked attention](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Masked_attention)".)

In an autoregressive task, the entire sequence is masked at first, and the model produces a probability distribution for the first token. Then the first token is revealed and the model predicts the second token, and so on. The loss function for the task is still typically the same. The [GPT series of models](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") are trained by autoregressive tasks.

In a prefixLM task, the sequence is divided into two parts. The first part is presented as context, and the model predicts the first token of the second part. Then that would be revealed, and the model predicts the second token, and so on. The loss function for the task is still typically the same. The [T5 series of models](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") are trained by prefixLM tasks. ("PrefixLM" as in "prefix language modeling" is not "prefixLM" as in "[prefix language model](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#prefixLM)".)

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

The dimension of an embedding vector is called *hidden size* or *embedding size* and written as $d_{\text{emb}}$. This size is written as $d_{\text{model}}$ in the original transformer paper.

### Un-embedding

An un-embedding layer is almost the reverse of an embedding layer. Whereas an embedding layer converts a token identifier into a vector, an un-embedding layer converts a vector into a probability distribution over tokens.

The un-embedding layer is a linear-[softmax](https://en.wikipedia.org/wiki/Softmax_function "Softmax function") layer:$$\mathrm{UnEmbed}(x) = \mathrm{softmax}(xW + b)$$The matrix has shape $(d_{\text{emb}}, |V|)$. Some architectures use the transpose of the embedding matrix $M$ as the un-embedding matrix $W$ in order to avoid needing double the amount of embedding-related parameters and to avoid divergence during training. This practice is called *weight tying*.

### Positional encoding

![Illustration of (absolute) positional encoding with parameters $N=10000, d=100$](https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Absolute_positional_encoding.png/250px-Absolute_positional_encoding.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

A positional encoding is a fixed-size vector representation of the relative positions of tokens within a sequence: it provides the transformer model with information about *where* the words are in the input sequence. This induces a [bias](https://en.wikipedia.org/wiki/Inductive_bias "Inductive bias") towards the order of the input sequence, so that, for example, the input sequence "[man bites dog](https://en.wikipedia.org/wiki/Man_bites_dog "Man bites dog")" is processed differently from "dog bites man".

The positional encoding is defined as a function of type $f: \R \to \R^d$, where $d$ is a positive even [integer](https://en.wikipedia.org/wiki/Integer "Integer"). The full positional encoding defined in the original paper is:$$(f(t)_{2k}, f(t)_{2k+1}) = (\sin(\theta), \cos(\theta)) \quad \forall k \in \{0, 1, \ldots, d/2 - 1\}$$where $\theta = \frac{t}{r^k}, r = N^{2/d}$.

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

The number of neurons in the middle layer is called *intermediate size* (GPT), *filter size* (BERT), or *feedforward size* (BERT). It is typically larger than the embedding size. For example, in both GPT-2 series and BERT series, the intermediate size of a model is 4 times its embedding size: $d_{\text{ffn}} = 4 d_{\text{emb}}$.

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

One set of $\left( W^Q, W^K, W^V \right)$ matrices is called an *attention head*, and each layer in a transformer model has multiple attention heads. While each attention head attends to the tokens that are relevant to each token, multiple attention heads allow the model to do this for different definitions of "relevance". Specifically, the query and key projection matrices, $W^Q$ and $W^K$, which are involved in the attention score computation, defines the "relevance". Meanwhile, the value [projection matrix](https://en.wikipedia.org/wiki/Projection_matrix "Projection matrix") $W^V$, in combination with the part of the output projection matrix $W^O$, determines how the attended tokens influence what information is passed to subsequent layers and ultimately the output logits. In addition, the scope of attention, or the range of token relationships captured by each attention head, can expand as tokens pass through successive layers. This allows the model to capture more complex and long-range dependencies in deeper layers. Many transformer attention heads encode relevance relations that are meaningful to humans. For example, some attention heads can attend mostly to the next word, while others mainly attend from verbs to their direct objects. The computations for each attention head can be performed in [parallel](https://en.wikipedia.org/wiki/Parallel_computing "Parallel computing"), which allows for fast processing. The outputs for the attention layer are concatenated to pass into the [feedforward neural network](https://en.wikipedia.org/wiki/Feedforward_neural_network "Feedforward neural network") layers.

Concretely, let the multiple attention heads be indexed by $i$, then we have$$\operatorname{MultiheadAttention}(Q, K, V) = \operatorname{Concat}_{i \in [n_{\text{heads}}]}(\operatorname{Attention}(XW^{Q, i}, XW^{K, i}, XW^{V, i})) W^O$$ where the matrix $X$ is the concatenation of word embeddings, and the matrices $W^{Q, i}, W^{K, i}, W^{V, i}$ are "projection matrices" owned by individual attention head $i$, and $W^O$ is a final projection matrix owned by the whole multihead attention module.

It is theoretically possible for each attention head to have a different head dimension $d_{\text{head}}$, but that is rarely the case in practice.

As an example, in the smallest GPT-2 model, there are only self-attention mechanisms. It has the following dimensions:$$d_{\text{emb}} = 768, n_{\text{head}} = 12, d_{\text{head}} = 64$$Since $12 \times 64 = 768$, its output projection matrix $W^O \in \R^{(12 \times 64) \times 768}$ is a square matrix.

#### Masked attention

The transformer architecture is constructed to calculate output tokens iteratively. Assuming $t = 0$ refers to the calculation of the first output token $i = 0$, for step $t > 0$, the output token $i = 0$ shall remain constant. This ensures properties of the model similar to [autoregressive models](https://en.wikipedia.org/wiki/Autoregressive_models "Autoregressive models"). Therefore, at every time step $t$, the calculation for all outputs $i$ should not have access to tokens at position $j$ for $j >= i$ (as it naturally is the case for time step $t=i$, when tokens $j>t$ are not yet calculated). This behavior may be accomplished before the softmax stage by adding a mask matrix $M$ that is $-\infty$ at entries where the attention link must be cut, and $0$ at other places:$$\begin{align}
\text{MaskedAttention}(Q, K, V) = \text{softmax}\left(\frac{QK^\mathrm{T}}{\sqrt{d_k}} + M\right)V
\end{align}$$ The following matrix is commonly used in decoder self-attention modules, called "causal masking":$$M_{\text{causal}} = \begin{bmatrix}
0 & -\infty & -\infty & \dots  & -\infty \\
0 & 0 & -\infty & \dots  & -\infty \\
0 & 0 & 0 & \dots  & -\infty \\
\vdots & \vdots & \vdots & \ddots & \vdots \\
0 & 0 & 0 & \dots  & 0
\end{bmatrix}$$

In words, it means that each token can pay attention to itself, and every token before it, but not any after it. A non-masked attention module can be thought of as a masked attention module where the mask has all entries zero. As an example of an uncommon use of mask matrix, the [XLNet](https://en.wikipedia.org/wiki/XLNet "XLNet") considers all masks of the form $P M_{\text{causal}} P^{-1}$, where $P$ is a random [permutation matrix](https://en.wikipedia.org/wiki/Permutation_matrix "Permutation matrix").

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

Each decoder consists of three major components: a causally masked self-attention mechanism, a cross-attention mechanism, and a feed-forward neural network. The decoder functions in a similar fashion to the encoder, but an additional attention mechanism is inserted which instead draws relevant information from the encodings generated by the encoders. This mechanism can also be called the *encoder–decoder attention*.
Like the first encoder, the first decoder takes positional information and embeddings of the output sequence as its input, rather than encodings. The transformer must not use the current or future output to predict an output, so the output sequence must be partially masked to prevent this reverse information flow. This allows for [autoregressive](https://en.wikipedia.org/wiki/Autoregressive_model "Autoregressive model") text generation. For decoding, all-to-all attention is inappropriate, because a token cannot attend to tokens not yet generated. Thus, the self-attention module in the decoder is causally masked.

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

In the pre-LN convention, the output of each sublayer is$$x + \mathrm{Sublayer}(\mathrm{LayerNorm}(x))$$The original 2017 transformer used the post-LN convention. It was difficult to train and required careful hyperparameter tuning and a "warm-up" in learning rate, where it starts small and gradually increases. The pre-LN convention, proposed several times in 2018, was found to be easier to train, requiring no warm-up, leading to faster convergence.

### Pseudocode

The following is the pseudocode for a standard pre-LN encoder–decoder transformer, adapted from *Formal Algorithms for Transformers*.

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

The transformer architecture, being modular, allows variations. Several common variations are described here.

An "encoder-only" transformer applies the encoder to map an input text into a sequence of vectors that represent the input text. This is usually used for text embedding and [representation learning](https://en.wikipedia.org/wiki/Feature_learning "Feature learning") for downstream applications. [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") is encoder-only. They are less often used currently, as they were found to be not significantly better than training an encoder–decoder transformer, then taking just the encoder. They are also referred to as "all-to-all" or "BERT-like".

A "decoder-only" transformer is not literally decoder-only, since without an encoder, the cross-attention mechanism has nothing to attend to. Thus, the decoder layers in a decoder-only transformer are composed of just two sublayers: the causally masked self-attention, and the feedforward network. This is usually used for [text generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation") and [instruction following](https://en.wikipedia.org/wiki/Large_language_model#Instruction_tuning "Large language model"). The models in the [GPT series](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") and [Chinchilla series](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)") are decoder-only. They are also referred to as "autoregressive" or "causal".

An "encoder–decoder" transformer is generally the same as the original transformer, with 2 sublayers per encoder layer and 3 sublayers per decoder layer, etc. They might have minor architectural improvements, such as [alternative activation functions](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_activation_functions), [changing the location of normalization](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#pre-LN), etc. This is also usually used for text generation and instruction following. The models in the [T5 series](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") are encoder–decoder.

A "prefixLM" (prefix language model) is a decoder-only architecture, but with prefix masking, which is different from causal masking. Specifically, it has mask of the form<sup>: Figure 3</sup>$$M_{\text{prefixLM}} = \begin{bmatrix}
\mathbf{0} &  -\infty \\
\mathbf{0} & M_{\text{causal}} 
\end{bmatrix}$$where the first columns correspond to the "prefix", and the subsequent columns correspond to the autoregressively generated text based on the prefix. They resemble encoder–decoder models, but has less "sparsity". Such models are rarely used, though they are cited as theoretical possibilities and benchmarked comparisons.

There are also mixed seq2seq models. For example, in 2020, Google Translate replaced the previous RNN-encoder–RNN-decoder model with a transformer-encoder–RNN-decoder model, as transformer-based decoders did not appear to significantly increase quality unlike the encoder, while the RNN decoder was much faster.

## Subsequent work

Many improvements have been added to the Transformer architecture. A standard improved configuration is Transformer++, which uses [RoPE](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#RoPE), [RMSNorm](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_normalizations), and [SwiGLU](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29#Alternative_activation_functions) feedforward module.

### Alternative feedforward module

The original transformer's feedforward module is a standard linear-[ReLU](https://en.wikipedia.org/wiki/ReLU "ReLU")-linear network. Other feedforward modules were developed. The [Llama series](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)") and [PaLM](https://en.wikipedia.org/wiki/PaLM "PaLM") used SwiGLU; both GPT-1 and BERT used GELU.

Alternative activation functions are often used in combination with [Gated Linear Units](https://en.wikipedia.org/wiki/Gated_Linear_Unit "Gated Linear Unit") in the feedforward module.

### Alternative normalizations

The normalization used in the transformer can be different from LayerNorm. One example is [RMSNorm](https://en.wikipedia.org/wiki/RMSNorm "RMSNorm") which is used in the [Llama series](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)"). Other examples include ScaleNorm and FixNorm.

### Alternative positional encodings

Transformers may use other positional encoding methods than sinusoidal.

The original transformer paper reported using a learned positional encoding, but finding it not superior to the sinusoidal one. Later, found that causal masking itself provides enough signal to a transformer decoder that it can learn to implicitly perform absolute positional encoding without the positional encoding module.

### Efficient implementation

The transformer model has been implemented in standard deep learning [frameworks](https://en.wikipedia.org/wiki/Framework_%28computer_science%29 "Framework (computer science)") such as [TensorFlow](https://en.wikipedia.org/wiki/TensorFlow "TensorFlow") and [PyTorch](https://en.wikipedia.org/wiki/PyTorch "PyTorch"). *Transformers* is a library produced by [Hugging Face](https://en.wikipedia.org/wiki/Hugging_Face "Hugging Face") that supplies transformer-based architectures and pretrained models.

#### KV caching

When an autoregressive transformer is used for inference, such as generating text, the query vector is different at each step, but the already-computed key and value vectors are always the same. The **KV caching** method saves the computed key and value vectors at each attention block, so that they are not recomputed at each new token. [PagedAttention](https://en.wikipedia.org/wiki/PagedAttention "PagedAttention") applies [memory paging](https://en.wikipedia.org/wiki/Memory_paging "Memory paging") to KV caching.

If a transformer is used with a baked-in prompt, such as ["You are a customer support agent..."], then the key and value vectors can be computed for the prompt, and saved on disk. The saving in compute is significant when the model is used for many short real-time interactions, such as in online chatbots.

In general, when a user uses an autoregressive transformer to generate a continuation to a sequence of tokens, the model would first perform a forward-pass on this sequence, whereby the KV caches over this sequence are computed. This is called **prefilling**. After prefilling, the actual token generation is called **decoding**. [Hyperscalers](https://en.wikipedia.org/wiki/Hyperscale_computing "Hyperscale computing") serving large Transformer models may use **disaggregated inference**, wherein prefilling and decoding are performed on separately specialized hardware.

#### Continuous Batching

When using autoregressive transformer models, requests can have different input lengths and can finish generating at different times. Continuous batching adds new requests to batch and removes completed requests between decoding iterations instead of waiting for every request in a batch to finish. This improves hardware utilization and can reduce latency and increase throughput for systems that serve many concurrent requests.

#### Quantization

Transformer models are often quantized for inference, meaning that weights, activations, or both are represented with lower-precision numerical formats than the floating point formats used during training. Quantization can reduce memory use and data transfer costs and can improve inference speed on hardware that supports low precision arithmetic. The trade off is that aggressive quantization can come at the cost of model accuracy or may need calibration and specialized quantization methods to perform well.

#### FlashAttention

FlashAttention is an algorithm that implements the transformer attention mechanism efficiently on a [GPU](https://en.wikipedia.org/wiki/Graphics_processing_unit "Graphics processing unit"). It is a communication-avoiding algorithm that performs [matrix multiplications in blocks](https://en.wikipedia.org/wiki/Block_matrix#Block_matrix_operations "Block matrix"), such that each block fits within the [cache](https://en.wikipedia.org/wiki/Cache_%28computing%29 "Cache (computing)") of a GPU, and by careful management of the blocks it minimizes data copying between GPU caches (as data movement is slow).

The [FlashAttention](https://en.wikipedia.org/wiki/FlashAttention "FlashAttention") method is a [communication-avoiding algorithm](https://en.wikipedia.org/wiki/Communication-avoiding_algorithm "Communication-avoiding algorithm") that fuses these operations into a single loop, increasing the [arithmetic intensity](https://en.wikipedia.org/wiki/Arithmetic_intensity "Arithmetic intensity"). It is an [online algorithm](https://en.wikipedia.org/wiki/Online_algorithm "Online algorithm") that computes the following quantities:$$\begin{aligned}
z_i &= q^T k_i &\\
m_i &= \max(z_1, \dots, z_i) &={}& \max(m_{i-1}, z_i)\\
\ell_i &= e^{z_1 - m_i} + \dots + e^{z_i - m_i} &={}& e^{m_{i-1}-m_i} \ell_{i-1}  + e^{z_i - m_i}\\
o_i &= e^{z_1 - m_i} v_1 + \dots + e^{z_i - m_i}v_i &={}& e^{m_{i-1}-m_i} o_{i-1} + e^{z_i - m_i}v_i
\end{aligned}$$and returns $o_N/\ell_N$. In practice, FlashAttention operates over multiple queries and keys per loop iteration, in a similar way as [blocked matrix multiplication](https://en.wikipedia.org/wiki/Communication-avoiding_algorithm#Blocked_%28tiled%29_matrix_multiplication "Communication-avoiding algorithm"). If [backpropagation](https://en.wikipedia.org/wiki/Backpropagation "Backpropagation") is needed, then the output vectors and the intermediate arrays $[m_1, \dots, m_N], [\ell_1, \dots, \ell_N]$ are cached, and during the backward pass, attention matrices are [rematerialized](https://en.wikipedia.org/wiki/Rematerialization "Rematerialization") from these, making it a form of gradient checkpointing.

An improved version, FlashAttention-2, was developed to handle longer context lengths.

#### Multi-Query Attention

![Comparison between several different forms of attention mechanism and the amount of KV caching necessary for each](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/DeepSeek_KV_cache_comparison_between_MHA%2C_GQA%2C_MQA%2C_MLA.svg/250px-DeepSeek_KV_cache_comparison_between_MHA%2C_GQA%2C_MQA%2C_MLA.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Multi-Query Attention (MQA) changes the Multihead Attention mechanism. Whereas normally,

$$\text{MultiheadAttention}(Q, K, V) = \text{Concat}_{i \in [n_{\text{heads}}]}\left(\text{Attention}(XW^Q_i, XW^K_i, XW^V_i)\right) W^O$$with Multi-Query Attention, there is just one $W^K, W^V$, thus:

$$\text{MultiQueryAttention}(Q, K, V) = \text{Concat}_{i \in [n_{\text{heads}}]}\left(\text{Attention}(XW^Q_i, XW^K, XW^V)\right) W^O$$

This has a neutral effect on model quality and training speed, but increases inference speed.

More generally, grouped-query attention (GQA) partitions attention heads into groups, each of which shares the key-value pair. MQA is GQA with one group, while standard Multihead Attention is GQA with the maximal number of groups.

![The architecture of V2, showing both MLA and a variant of [mixture of experts](https://en.wikipedia.org/wiki/Mixture_of_experts "Mixture of experts")<sup>: Figure 2</sup>](https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/DeepSeek_MoE_and_MLA_%28DeepSeek-V2%29.svg/250px-DeepSeek_MoE_and_MLA_%28DeepSeek-V2%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Multihead Latent Attention (MLA) is a [low-rank approximation](https://en.wikipedia.org/wiki/Low-rank_approximation "Low-rank approximation") to MQA. Specifically, each hidden vector, before entering the attention mechanism, is first projected to two low-dimensional spaces ("latent space"), one for query and one for key-value (KV vector). This design minimizes the KV cache, as only the low-dimensional KV vector needs to be cached.

#### Speculative decoding

Speculative decoding is a method to accelerate token decoding. Similarly to [speculative execution](https://en.wikipedia.org/wiki/Speculative_execution "Speculative execution") in CPUs, future tokens are computed quickly, then verified. If the quickly computed tokens are incorrect, they are discarded and computed slowly.

The key factor in speculative decoding is that a transformer decoder can verify faster than it can decode, in the following sense.

Suppose we have two transformer models like GPT-3 and GPT-3-small, both with a context window size of 512. To generate an entire context window autoregressively with greedy decoding with GPT-3, it must be run for 512 times, each time generating a token $x_1, x_2, ..., x_{512}$, taking time $512 T_{\text{GPT-3}}$. However, if we had some educated guess for the values of these tokens, we could verify all of them in parallel, in one run of the model, by checking that each $x_t$ is indeed the token with the largest log-likelihood in the $t$-th output.

In speculative decoding, a smaller model or some other simple heuristic is used to generate a few speculative tokens that are subsequently verified by the larger model. For example, suppose we use GPT-3-small to generate four speculative tokens: $\tilde{x}_1, \tilde{x}_2, \tilde{x}_3, \tilde{x}_4$. This only takes $4 T_{\text{GPT-3-small}}$. These tokens are then run through the larger GPT-3 in one go. Suppose that $\tilde{x}_1$ and $\tilde{x}_2$ are verified by GPT-3 as what it would have picked, then those are kept, but $\tilde{x}_3$ is not, so $\tilde{x}_3, \tilde{x}_4$ are discarded, and GPT-3 is run on those. This would take $4 T_{\text{GPT-3-small}} + 3 T_{\text{GPT-3}}$, which might be shorter than $4 T_{\text{GPT-3}}$.

For non-greedy decoding, similar ideas apply, except the speculative tokens are accepted or rejected stochastically, in a way that guarantees the final output distribution is the same as if speculative decoding was not used.

![Multi-token prediction](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Multi-Token_Prediction_%28DeepSeek%29_01.svg/250px-Multi-Token_Prediction_%28DeepSeek%29_01.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In Multi-Token Prediction, a single forward pass creates a final embedding vector, which then is un-embedded into a token probability. However, that vector can then be further processed by another transformer block to predict the *next* token, and so on for arbitrarily many steps into the future. This trades off accuracy for speed, since each new token costs just one more transformer block, rather than the entire stack.

### Sub-quadratic transformers

Training transformer-based architectures can be expensive, especially for long inputs. Many methods have been developed to attempt to address the issue. In the image domain, Swin transformer is an efficient architecture that performs attention inside shifting windows. In the audio domain, SepTr decouples the attention in time and frequency domains. *Long Range Arena* (2020) is a standard benchmark for comparing the behavior of transformer architectures over long inputs.

#### Alternative attention graphs

The standard attention graph is either all-to-all or causal, both of which scales as $O(N^2)$ where $N$ is the number of tokens in a sequence.

Reformer (2020) reduces the computational load from $O(N^2)$ to $O(N\ln N)$ by using [locality-sensitive hashing](https://en.wikipedia.org/wiki/Locality-sensitive_hashing "Locality-sensitive hashing") and reversible layers.

Sparse attention uses attention graphs that grows slower than $O(N^2)$. For example, BigBird (2020) uses random [small-world networks](https://en.wikipedia.org/wiki/Small-world_network "Small-world network") which grows as $O(N)$.

Ordinary transformers require a memory size that is quadratic in the size of the context window. Attention-free transformers reduce this to a linear dependence while still retaining the advantages of a transformer by linking the key to the value.

#### Random Feature Attention

Random Feature Attention (2021) uses [Fourier random features](https://en.wikipedia.org/wiki/Radial_basis_function_kernel#Fourier_random_features "Radial basis function kernel"):$$\varphi(x) = \frac{1}{\sqrt D}[\cos\langle w_1, x\rangle, \sin\langle w_1, x\rangle, \cdots \cos\langle w_D, x\rangle, \sin\langle w_D, x\rangle]^T$$where $w_1, ..., w_D$ are independent samples from the normal distribution $N(0, \sigma^2 I)$. This choice of parameters satisfies$\mathbb E[\langle \varphi(x), \varphi(y)\rangle] = e^{-\frac{\|x-y\|^2}{2\sigma^2}}$, or $$e^{\langle x, y\rangle/\sigma^2} = \mathbb E[\langle e^{\|x\|^2/2\sigma^2} \varphi(x), e^{\|y\|^2/2\sigma^2}\varphi(y)\rangle] \approx \langle e^{\|x\|^2/2\sigma^2} \varphi(x), e^{\|y\|^2/2\sigma^2}\varphi(y)\rangle$$Consequently, the one-headed attention, with one query, can be written as $$\text{Attention}(q, K, V) = \text{softmax}\left(\frac{qK^\mathrm{T}}{\sqrt{d_k}}\right)V
\approx \frac{\varphi(q)^T \sum_i e^{\|k_i\|^2/2\sigma^2}\varphi(k_i) v_i^T}{\varphi(q)^T \sum_i e^{\|k_i\|^2/2\sigma^2}\varphi(k_i)}$$where $\sigma = d_K^{1/4}$. Similarly for multiple queries, and for multihead attention.

This approximation can be computed in linear time, as we can compute the matrix $\varphi(k_i) v_i^T$ first, then multiply it with the query. In essence, we have managed to obtain a more precise version of $$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^\mathrm{T}}{\sqrt{d_k}}\right)V \approx Q(K^TV/\sqrt{d_k})$$Performer (2020) uses the same Random Feature Attention, but $w_1, ..., w_D$ are first independently sampled from the normal distribution $N(0, \sigma^2 I)$, then they are [Gram–Schmidt processed](https://en.wikipedia.org/wiki/Gram–Schmidt_process "Gram–Schmidt process").

### Multimodality

Transformers can also be used/adapted for modalities (input or output) beyond just text, usually by finding a way to "tokenize" the modality.

Multimodal models can either be trained from scratch, or by finetuning. A 2022 study found that transformers pretrained only on natural language can be finetuned on only 0.03% of parameters and become competitive with [LSTMs](https://en.wikipedia.org/wiki/LSTMs "LSTMs") on a variety of logical and visual tasks, demonstrating [transfer learning](https://en.wikipedia.org/wiki/Transfer_learning "Transfer learning"). The LLaVA was a vision-language model composed of a language model (Vicuna-13B) and a vision model ([ViT](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer")-L/14), connected by a linear layer. Only the linear layer is finetuned.

[Vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer") adapt the transformer to computer vision by breaking down input images as a series of patches, turning them into vectors, and treating them like embedding vectors of tokens in a standard transformer.

Conformer and later [Whisper](https://en.wikipedia.org/wiki/Whisper_%28speech_recognition_system%29 "Whisper (speech recognition system)") follow the same pattern for [speech recognition](https://en.wikipedia.org/wiki/Speech_recognition "Speech recognition"), first turning the speech signal into a [spectrogram](https://en.wikipedia.org/wiki/Spectrogram "Spectrogram"), which is then treated like an image, i.e. broken down into a series of patches, turned into vectors and treated like embedding vector of tokens in a standard transformer.

[Perceivers](https://en.wikipedia.org/wiki/Perceiver "Perceiver") are a variant of transformers designed for multimodality.

For image generation, notable architectures are [DALL-E 1](https://en.wikipedia.org/wiki/DALL-E "DALL-E") (2021), Parti (2022), Phenaki (2023), and Muse (2023). Unlike later models, DALL-E is not a [diffusion model](https://en.wikipedia.org/wiki/Diffusion_model "Diffusion model"). Instead, it uses a decoder-only transformer that autoregressively generates a text, followed by the token representation of an image, which is then converted by a [variational autoencoder](https://en.wikipedia.org/wiki/Variational_autoencoder "Variational autoencoder") to an image. Parti is an encoder–decoder transformer, where the encoder processes a text prompt, and the decoder generates a token representation of an image. Muse is an encoder-only transformer that is trained to predict masked image tokens from unmasked image tokens. During generation, all input tokens are masked, and the highest-confidence predictions are included for the next iteration, until all tokens are predicted. Phenaki is a text-to-video model. It is a bidirectional masked transformer conditioned on pre-computed text tokens. The generated tokens are then decoded to a video.

## Applications

The transformer has had great success in [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") (NLP). Many [large language models](https://en.wikipedia.org/wiki/Large_language_model "Large language model") such as [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2"), [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3"), [GPT-4](https://en.wikipedia.org/wiki/GPT-4 "GPT-4"), [Gemini](https://en.wikipedia.org/wiki/Gemini_%28chatbot%29 "Gemini (chatbot)"), AlbertAGPT, [Claude](https://en.wikipedia.org/wiki/Claude_%28AI%29 "Claude (AI)"), [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)"), [Grok](https://en.wikipedia.org/wiki/Grok_%28chatbot%29 "Grok (chatbot)"), [XLNet](https://en.wikipedia.org/wiki/XLNet "XLNet"), [RoBERTa](https://en.wikipedia.org/wiki/BERT_%28language_model%29#RoBERTa "BERT (language model)") and [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT") demonstrate the ability of transformers to perform a wide variety of NLP-related subtasks and their related real-world applications, including:

- [machine translation](https://en.wikipedia.org/wiki/Machine_translation "Machine translation")
- [time series](https://en.wikipedia.org/wiki/Time_series "Time series") prediction
- [document summarization](https://en.wikipedia.org/wiki/Automatic_summarization "Automatic summarization")
- [document generation](https://en.wikipedia.org/wiki/Natural_language_generation "Natural language generation")
- [named entity recognition](https://en.wikipedia.org/wiki/Named-entity_recognition "Named-entity recognition") (NER)
- [writing computer code](https://en.wikipedia.org/wiki/Computer_programming "Computer programming") based on requirements expressed in natural language.
- [speech-to-text](https://en.wikipedia.org/wiki/Speech-to-text "Speech-to-text")

Beyond traditional NLP, the transformer architecture has had success in other applications, such as:

- [biological sequence analysis](https://en.wikipedia.org/wiki/Sequence_analysis "Sequence analysis")
- [video understanding](https://en.wikipedia.org/wiki/Computer_vision "Computer vision")
- [protein folding](https://en.wikipedia.org/wiki/Protein_structure_prediction "Protein structure prediction") (such as [AlphaFold](https://en.wikipedia.org/wiki/AlphaFold "AlphaFold"))
- [evaluating](https://en.wikipedia.org/wiki/Evaluation_function "Evaluation function") chess board positions. Using static evaluation alone (that is, with no [Minimax](https://en.wikipedia.org/wiki/Minimax "Minimax") search) transformer achieved an [Elo](https://en.wikipedia.org/wiki/Elo_rating_system "Elo rating system") of 2895, putting it at [grandmaster](https://en.wikipedia.org/wiki/Grandmaster_%28chess%29 "Grandmaster (chess)") level.
- service function chain embedding

# Attention (machine learning) {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Attention_(machine_learning)](https://en.wikipedia.org/wiki/Attention_(machine_learning))* | *Author: Wikipedia contributors*
:::

![Attention mechanism, overview](https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Attention_mechanism_overview.svg/250px-Attention_mechanism_overview.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning"), **attention** is a method that determines the importance of, or "attends to", each component in a sequence relative to the other components in that sequence. In [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), importance is represented by weights assigned to each word in a sentence. More generally, attention encodes [vectors](https://en.wikipedia.org/wiki/Vector_%28mathematics_and_physics%29 "Vector (mathematics and physics)") called [token](https://en.wikipedia.org/wiki/Lexical_analysis "Lexical analysis") [embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") across a fixed-width [sequence](https://en.wikipedia.org/wiki/Context_window "Context window") that can range from tens to millions of tokens in size.

Earlier designs implemented the attention mechanism in a serial [recurrent neural network](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network") (RNN) language translation system, but a more recent design, namely the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)"), removed the slower sequential RNN and relied more heavily on the faster parallel attention scheme, which has largely replaced RNN in frontier models since [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)"), [T5](https://en.wikipedia.org/wiki/T5_%28language_model%29 "T5 (language model)") and [GPT](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer").

Inspired by ideas about [attention in humans](https://en.wikipedia.org/wiki/Attention "Attention"), the attention mechanism was developed to address the weaknesses of using information from the [hidden layers](https://en.wikipedia.org/wiki/Hidden_layer "Hidden layer") of recurrent neural networks. Recurrent neural networks favor information contained in words at the end of a sentence and thus deemed more recent, thereby tending to [attenuate](https://en.wikipedia.org/wiki/Vanishing_gradient_problem "Vanishing gradient problem") the significance and associated predictive weight assigned to information earlier in the sentence. Attention allows a token equal access to any part of a sentence directly, rather than only through the previous state.

## History

Academic reviews of the history of the attention mechanism are provided in Niu et al. and Soydaner.

### Predecessors

[Selective attention](https://en.wikipedia.org/wiki/Attentional_control "Attentional control") in humans had been well studied in neuroscience and cognitive psychology. In 1953, [Colin Cherry](https://en.wikipedia.org/wiki/Colin_Cherry "Colin Cherry") studied selective attention in the context of audition, known as the [cocktail party effect](https://en.wikipedia.org/wiki/Cocktail_party_effect "Cocktail party effect").

In 1958, [Donald Broadbent](https://en.wikipedia.org/wiki/Donald_Broadbent "Donald Broadbent") proposed the [filter model of attention](https://en.wikipedia.org/wiki/Broadbent's_filter_model_of_attention "Broadbent's filter model of attention"). Selective attention of vision was studied in the 1960s by [George Sperling](https://en.wikipedia.org/wiki/George_Sperling "George Sperling")'s [partial report paradigm](https://en.wikipedia.org/wiki/Iconic_memory#Sperling's_partial_report_procedure "Iconic memory"). It was also noticed that [saccade control](https://en.wikipedia.org/wiki/Saccade "Saccade") is modulated by cognitive processes, insofar as the eye moves preferentially towards areas of high [salience](https://en.wikipedia.org/wiki/Salience_%28neuroscience%29 "Salience (neuroscience)"). As the fovea of the eye is small, the eye cannot sharply resolve the entire visual field at once. The use of saccade control allows the eye to quickly scan important features of a scene.

These research developments inspired algorithms such as the [Neocognitron](https://en.wikipedia.org/wiki/Neocognitron "Neocognitron") and its variants. Meanwhile, developments in neural networks had inspired circuit models of biological visual attention. One well-cited network from 1998, for example, was inspired by the [low-level primate visual system](https://en.wikipedia.org/wiki/Visual_cortex "Visual cortex"). It produced [saliency maps](https://en.wikipedia.org/wiki/Saliency_map "Saliency map") of images using handcrafted (not learned) features, which were then used to guide a second neural network in processing patches of the image in order of reducing saliency.

A key aspect of attention mechanism can be written (schematically) as $$\sum_i \langle(\text{query})_i, (\text{key})_i\rangle (\text{value})_i$$where the angled brackets denote dot product. This shows that it involves a multiplicative operation. Multiplicative operations within artificial neural networks had been studied under the names of *[higher-order neural networks](https://en.wikipedia.org/wiki/Higher-order_neural_network?action=edit&redlink=1 "Higher-order neural network")*, *multiplication units*, *sigma-pi units*, *fast weight controllers*, and *hyper-networks*.

In *fast weight controller*, one of its two networks has "fast weights" or "dynamic links" (1981). A slow neural network learns by gradient descent to generate keys and values for computing the weight changes of the fast neural network which computes answers to queries. This is dot-product attention without softmax.

### Recurrent attention

During the deep learning era, attention mechanism was developed to solve similar problems in encoding-decoding.

In machine translation, the [seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq") model, as it was proposed in 2014, would encode an input text into a fixed-length vector, which would then be decoded into an output text. If the input text is long, the fixed-length vector would be unable to carry enough information for accurate decoding. An attention mechanism was proposed to solve this problem.

An image captioning model was proposed in 2015, citing inspiration from the seq2seq model. that would encode an input image into a fixed-length vector. (Xu et al 2015), citing (Bahdanau et al 2014), applied the attention mechanism as used in the seq2seq model to image captioning.

### Transformer

One problem with seq2seq models was their use of recurrent neural networks, which are not parallelizable as both the encoder and the decoder must process the sequence token-by-token. *Decomposable attention* attempted to solve this problem by processing the input sequence in parallel, before computing a "soft alignment matrix" (*alignment* is the terminology used by Bahdanau et al) in order to allow for parallel processing.

The idea of using the attention mechanism for self-attention, instead of in an encoder-decoder (cross-attention), was also proposed during this period, such as in [differentiable neural computers](https://en.wikipedia.org/wiki/Differentiable_neural_computer "Differentiable neural computer") and [neural Turing machines](https://en.wikipedia.org/wiki/Neural_Turing_machine "Neural Turing machine"). It was termed *intra-attention* where an LSTM is augmented with a memory network as it encodes an input sequence.

These strands of development were brought together in 2017 with the [Transformer architecture](https://en.wikipedia.org/wiki/Transformer_architecture "Transformer architecture"), published in the *[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")* paper.

## Dot-product attention

Given three matrices: $Q\in\mathbb{R}^{m\times d_Q}, K\in\mathbb{R}^{n\times d_K}$ and $V\in\mathbb{R}^{n\times d_V}$, the scaled dot-product attention is defined as:$$\text{Attention}(Q, K, V) = \text{softmax}\left(\lambda QK^T\right)V\in\mathbb{R}^{m\times d_v}$$where ${}^T$ denotes [transpose](https://en.wikipedia.org/wiki/Transpose "Transpose") and the [softmax function](https://en.wikipedia.org/wiki/Softmax_function "Softmax function") is applied independently to every row of its argument. $\lambda$ is a scalar. It is usually set to $1/\sqrt{d_K}$.

The matrix $Q$ contains $m$ queries, while matrices $K, V$ jointly contain $n$ key-value pairs. Value vectors in matrix $V$ are weighted using the weights resulting from the softmax operation, so that the rows of the $m$-by-$d_v$ output matrix are confined to the [convex hull](https://en.wikipedia.org/wiki/Convex_hull "Convex hull") of the points in $\mathbb{R}^{d_v}$ given by the rows of $V$.

Attention mechanism without positional encoding is permutation-invariant.

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

[Lernmatrix](https://en.wikipedia.org/wiki/Lernmatrix "Lernmatrix"), or correlation matrix memory, is causally masked dot-product attention, without softmax. In a causally masked dot-product attention, the $i$-th output vector is equal to $$o_i = \frac{1}{\sum_{j \leq i} e^{q_i k_j^T} } \sum_{j \leq i} e^{q_i k_j^T} v_j$$removing the softmaix yields the correlation matrix memory:$$o_i = q_i \sum_{j \leq i } k_j^T v_j$$and Lernmatrix is the special case where all vectors are binary.

Bahdanau et al (2014) proposed an additive form of attention$$z_{ij} = \tanh(q_i W^Q + k_j W^K) w^T$$where $W^Q, W^K$ are learnable matrices, and $w$ is a learnable vector.

Luong et al (2015) attempted to improve upon Bahdanau et al (2014). They tested at least two different forms of attentions, two of which are the modern form of dot-product attention. They worked on seq2seq machine translation. A multilayered LSTM processes an input sequence $x_1, \dots, x_n$ (such as a sequence of words in an English sequence) into a sequence of vectors $k_1, \dots, k_n$. It then receives a special token `<EOS>` ("end of sequence") to mark as $x_0'$, the beginning of the output sequence. It then proceeds as follows:

- Given another output $x_i'$, run the LSTM for another step, obtaining output $q_i$.
- $q_i$ pays attention to input key-value pairs. The key and value vectors are the same: $k_i = v_i$.
- The attention scores $z_{ij}$ are calculated as either $z_{ij} = q_i W k_j^T$, as in modern dot-product attention, or as $z_{ij} = \tanh(q_i W^Q + k_j W^K) w^T$, as in Bahdanau et al (2014).
- The output vector is $o_i = \frac{1}{\sum_{j \leq i} e^{z_{ij}} } \sum_{j \leq i} e^{z_{ij}} v_j$.
- The output word is sampled from $\operatorname{softmax}(\tanh(o_i W^Q + q_i W^Q) W)$.

## Optimizations

### Flash attention

The size of the attention matrix is proportional to the square of the number of input tokens. Therefore, when the input is long, calculating the attention matrix requires a lot of [GPU](https://en.wikipedia.org/wiki/GPU "GPU") memory. Flash attention is an implementation that reduces the memory needs and increases efficiency without sacrificing accuracy. It achieves this by partitioning the attention computation into smaller blocks that fit into the GPU's faster on-chip memory, reducing the need to store large intermediate matrices and thus lowering memory usage while increasing computational efficiency.

### FlexAttention

FlexAttention is an attention kernel developed by [Meta](https://en.wikipedia.org/wiki/Meta_Platforms "Meta Platforms") that allows users to modify attention scores prior to [softmax](https://en.wikipedia.org/wiki/Softmax "Softmax") and dynamically chooses the optimal attention algorithm.

### KV cache

## Applications

Attention is widely used in [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing"), [computer vision](https://en.wikipedia.org/wiki/Computer_vision "Computer vision"), and [speech recognition](https://en.wikipedia.org/wiki/Speech_recognition "Speech recognition"). In natural language processing, it improves context understanding in tasks like question answering and summarization. In vision, visual attention helps models focus on relevant image regions, enhancing object detection and image captioning.

### Attention maps as explanations for vision transformers

From the original paper on [vision transformers](https://en.wikipedia.org/wiki/Vision_transformer "Vision transformer") (ViT), visualizing attention scores as a heat map (called [saliency maps](https://en.wikipedia.org/wiki/Saliency_map "Saliency map") or attention maps) has become an important and routine way to inspect the decision making process of ViT models. One can compute the attention maps with respect to any attention head at any layer, while the deeper layers tend to show more semantically meaningful visualization. Attention rollout is a recursive algorithm to combine attention scores across all layers, by computing the dot product of successive attention maps.

Because vision transformers are typically trained in a [self-supervised](https://en.wikipedia.org/wiki/Self-supervised_learning "Self-supervised learning") manner, attention maps are generally not class-sensitive. When a classification head is attached to the ViT backbone, class-discriminative attention maps (CDAM) combines attention maps and gradients with respect to the class `[CLS]` token. Some class-sensitive [interpretability](https://en.wikipedia.org/wiki/Explainable_artificial_intelligence "Explainable artificial intelligence") methods originally developed for [convolutional neural networks](https://en.wikipedia.org/wiki/Convolutional_neural_network "Convolutional neural network") can be also applied to ViT, such as GradCAM, which [back-propagates](https://en.wikipedia.org/wiki/Backpropagation "Backpropagation") the gradients to the outputs of the final attention layer.

Using attention as basis of explanation for the transformers in language and vision is not without debate. While some pioneering papers analyzed and framed attention scores as explanations, higher attention scores do not always correlate with greater impact on model performances.

# Large language model {lang=en}
::: {.source-attribution}
*Source: [https://en.wikipedia.org/wiki/Large_language_model](https://en.wikipedia.org/wiki/Large_language_model)* | *Author: Wikipedia contributors*
:::

![The number of publications about large language models by year grouped by publication types](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/The_number_of_publications_about_Large_Language_Models_by_year.png/250px-The_number_of_publications_about_Large_Language_Models_by_year.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

A **large language model** (**LLM**) is a [machine learning model](https://en.wikipedia.org/wiki/Machine_learning#Models "Machine learning") (typically a [neural network](https://en.wikipedia.org/wiki/Neural_network_%28machine_learning%29 "Neural network (machine learning)")) trained on a vast amount of text for [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") tasks, especially [language generation](https://en.wikipedia.org/wiki/Language_generation "Language generation"). LLMs can typically generate, summarize, translate, and analyze text in many contexts. They are the basis for many modern [chatbots](https://en.wikipedia.org/wiki/Chatbot "Chatbot"), such as [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT"), [Claude](https://en.wikipedia.org/wiki/Claude_%28AI%29 "Claude (AI)"), [Vibe](https://en.wikipedia.org/wiki/Mistral_Vibe "Mistral Vibe"), [Gemini](https://en.wikipedia.org/wiki/Google_Gemini "Google Gemini"), [Grok](https://en.wikipedia.org/wiki/Grok_%28chatbot%29 "Grok (chatbot)"), [Qwen](https://en.wikipedia.org/wiki/Qwen "Qwen") and [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek_%28chatbot%29 "DeepSeek (chatbot)").

LLMs are typically based on the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)") neural network architecture. [Generative pre-trained transformers](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer "Generative pre-trained transformer") (GPTs) are a type of LLM that is pre-trained to predict the next word. GPTs are then often [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)") to follow instructions and to behave as assistants.

Biased or inaccurate training data can make an LLM's output less reliable. A [software harness](https://en.wikipedia.org/wiki/Agent_harness "Agent harness") can provide LLMs with memory and access to tools such as web search. [Benchmark](https://en.wikipedia.org/wiki/Language_model_benchmark "Language model benchmark") evaluations for LLMs attempt to measure [model reasoning](https://en.wikipedia.org/wiki/Reasoning_model "Reasoning model"), factual accuracy, [alignment](https://en.wikipedia.org/wiki/AI_alignment "AI alignment"), and [safety](https://en.wikipedia.org/wiki/AI_safety "AI safety").

## History

![The [training](https://en.wikipedia.org/wiki/AI_training "AI training") [compute](https://en.wikipedia.org/wiki/Compute_%28machine_learning%29 "Compute (machine learning)") of notable large models in FLOPs vs publication date over the period 2010–2024. For overall notable models (top left), frontier models (top right), top language models (bottom left) and top models within leading companies (bottom right). The majority of these models are language models.](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/Trends_in_AI_training_FLOP_over_time_%282010-2025%29.svg/250px-Trends_in_AI_training_FLOP_over_time_%282010-2025%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)



![The training compute of notable large AI models in FLOPs vs publication date over the period 2017–2024. The majority of large models are language models or multimodal models with language capacity.](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Large-scale_AI_training_compute_%28FLOP%29_vs_Publication_date_%282017-2024%29.svg/250px-Large-scale_AI_training_compute_%28FLOP%29_vs_Publication_date_%282017-2024%29.svg.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Before the emergence of [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning%29 "Transformer (deep learning)")-based models in 2017, some [language models](https://en.wikipedia.org/wiki/Language_model "Language model") were considered large relative to the computational and data constraints of their time. In the early 1990s, [IBM](https://en.wikipedia.org/wiki/IBM "IBM")'s [statistical models](https://en.wikipedia.org/wiki/Statistical_model "Statistical model") pioneered [word alignment](https://en.wikipedia.org/wiki/Bitext_word_alignment "Bitext word alignment") techniques for machine translation, laying the groundwork for [corpus-based language modeling](https://en.wikipedia.org/wiki/Construction_grammar "Construction grammar"). In 2001, a smoothed [*n*-gram model](https://en.wikipedia.org/wiki/Word_n-gram_language_model "Word n-gram language model"), such as those employing [Kneser–Ney smoothing](https://en.wikipedia.org/wiki/Kneser–Ney_smoothing "Kneser–Ney smoothing"), trained on 300 million words, achieved state-of-the-art [perplexity](https://en.wikipedia.org/wiki/Perplexity "Perplexity") on benchmark tests. During the 2000s, with the rise of widespread [internet access](https://en.wikipedia.org/wiki/Internet_access "Internet access"), researchers began compiling massive text datasets from the web ("web as corpus") to train statistical language models.

Moving beyond *n*-gram models, researchers started in 2000 to use neural networks as language models. Following the breakthrough of [deep neural networks](https://en.wikipedia.org/wiki/Deep_learning "Deep learning") in [image classification](https://en.wikipedia.org/wiki/Computer_vision "Computer vision") around 2012, similar architectures were adapted for language tasks. This shift was marked by the development of [word embeddings](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") (e.g., [Word2Vec](https://en.wikipedia.org/wiki/Word2vec "Word2vec") by [Mikolov](https://en.wikipedia.org/wiki/Tomáš_Mikolov "Tomáš Mikolov") in 2013) and sequence-to-sequence ([seq2seq](https://en.wikipedia.org/wiki/Seq2seq "Seq2seq")) models using [LSTM](https://en.wikipedia.org/wiki/Long_short-term_memory "Long short-term memory"). In 2016, Google transitioned its translation service to [neural machine translation](https://en.wikipedia.org/wiki/Neural_machine_translation "Neural machine translation") (NMT), replacing statistical phrase-based models with deep [recurrent neural networks](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network"). These early NMT systems used LSTM-based [encoder-decoder architectures](https://en.wikipedia.org/wiki/Encoder-decoder_model "Encoder-decoder model"), as they preceded the invention of [transformers](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29 "Transformer (deep learning architecture)").

![An illustration of the main components of the transformer model from the original paper, where layers were normalized after (instead of before) multiheaded attention](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/The-Transformer-model-architecture.png/330px-The-Transformer-model-architecture.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

At the 2017 [NeurIPS](https://en.wikipedia.org/wiki/NeurIPS "NeurIPS") conference, [Google](https://en.wikipedia.org/wiki/Google "Google") researchers introduced the transformer architecture in their landmark paper "[Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need "Attention Is All You Need")". This paper's goal was to improve upon 2014 seq2seq technology, and was based mainly on the [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism developed by Bahdanau et al. in 2014. The following year in 2018, [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") was introduced and quickly became "ubiquitous". Though the original transformer has both encoder and decoder blocks, BERT is an encoder-only model. Academic and research usage of BERT began to decline in 2023, following rapid improvements in the abilities of decoder-only models (such as GPT) to solve tasks via [prompting](https://en.wikipedia.org/wiki/Prompt_engineering "Prompt engineering").

Although decoder-only [GPT-1](https://en.wikipedia.org/wiki/GPT-1 "GPT-1") was introduced in 2018, it was [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2") in 2019 that caught widespread attention because [OpenAI](https://en.wikipedia.org/wiki/OpenAI "OpenAI") claimed to have initially deemed it too powerful to release publicly, out of fear of malicious use. [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") in 2020 went a step further and as of 2025 is available only via [API](https://en.wikipedia.org/wiki/Web_API "Web API") with no offering of downloading the model to execute locally. But it was the consumer-facing chatbot [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT "ChatGPT") in late 2022 that received extensive media coverage and public attention by 2023. The 2023 [GPT-4](https://en.wikipedia.org/wiki/GPT-4 "GPT-4") was praised for its increased accuracy and as a "holy grail" for its [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning") capabilities. OpenAI did not reveal the high-level architecture and the number of [parameters](https://en.wikipedia.org/wiki/Parameter#Artificial_intelligence "Parameter") of GPT-4. The release of ChatGPT led to an uptick in LLM usage across several research subfields of computer science, including robotics, software engineering, and societal impact work. In 2024, OpenAI released the [reasoning model](https://en.wikipedia.org/wiki/Reasoning_language_model "Reasoning language model") [OpenAI o1](https://en.wikipedia.org/wiki/OpenAI_o1 "OpenAI o1"), which generates long chains of thought before returning a final answer. Many LLMs with parameter counts comparable to those of OpenAI's GPT series have been developed.

Since 2022, [open-source](https://en.wikipedia.org/wiki/Open-source_artificial_intelligence "Open-source artificial intelligence") models (those with their source code and weights made publicly available) have been gaining popularity, especially at first with [BLOOM](https://en.wikipedia.org/wiki/BLOOM_%28language_model%29 "BLOOM (language model)") and [LLaMA](https://en.wikipedia.org/wiki/LLaMA "LLaMA"), though both have restrictions on the field of use. [Mistral AI](https://en.wikipedia.org/wiki/Mistral_AI "Mistral AI")'s open-weight models Mistral 7B and Mixtral 8x7B have a more permissive [Apache License](https://en.wikipedia.org/wiki/Apache_License "Apache License"). In January 2025, [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek "DeepSeek") released DeepSeek R1, a 671-billion-parameter open-weight model that performs comparably to OpenAI o1 but at a much lower price per token for users.

Since 2023, many LLMs have been trained to be [multimodal](https://en.wikipedia.org/wiki/Multimodal_learning "Multimodal learning"), having the ability to also process or generate other types of data, such as images, audio, or 3D meshes.

Open-weight LLMs have become more influential since 2023. Per Vake et al. (2025), community-driven contributions to open-weight models improve their efficiency and performance via collaborative platforms such as [Hugging Face](https://en.wikipedia.org/wiki/Hugging_Face "Hugging Face").

## Naming

There is no standard for naming large language models, but certain conventions are common. Usually, a model has a name with several parts, such as in "Qwen3-235B-A22B-Thinking-2507". The commonly used parts are:

- Model family name. For example: [Llama](https://en.wikipedia.org/wiki/Llama_%28language_model%29 "Llama (language model)"), [Kimi](https://en.wikipedia.org/wiki/Kimi_%28AI%29 "Kimi (AI)"), [GPT](https://en.wikipedia.org/wiki/GPT_%28OpenAI_model%29 "GPT (OpenAI model)"), [Gemma](https://en.wikipedia.org/wiki/Gemma_%28language_model%29 "Gemma (language model)").
  - Some models are derived from a more famous model family. These may be named somewhat idiosyncratically. For example, the Alpaca series was named so because they were derived from the Llama series.
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

As [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning") algorithms process numbers rather than text, the text must be converted to numbers. In the first step, a vocabulary is decided upon, then integer indices are arbitrarily but uniquely assigned to each vocabulary entry, and finally, an [embedding](https://en.wikipedia.org/wiki/Word_embedding "Word embedding") is associated with the integer index. Algorithms include [byte-pair encoding](https://en.wikipedia.org/wiki/Byte-pair_encoding "Byte-pair encoding") (BPE) and [WordPiece](https://huggingface.co/learn/llm-course/en/chapter6/6). There are also special tokens serving as [control characters](https://en.wikipedia.org/wiki/Control_character "Control character"), such as `[MASK]` for masked-out token (as used in [BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)")), and `[UNK]` ("unknown") for characters not appearing in the vocabulary. Also, some special symbols are used to denote special text formatting. For example, "Ġ" denotes a preceding whitespace in [RoBERTa](https://en.wikipedia.org/wiki/RoBERTa "RoBERTa") and GPT and "##" denotes continuation of a preceding word in BERT.

For example, the BPE tokenizer used by the legacy version of [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") would split

`tokenizer: texts -> series of numerical "tokens"`

as

|  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| token | izer | : | texts | -> | series | of | numerical | " | t | ok | ens | " |

Tokenization also [compresses](https://en.wikipedia.org/wiki/Data_compression "Data compression") the datasets. Because LLMs generally require input to be an [array](https://en.wikipedia.org/wiki/Array_%28data_structure%29 "Array (data structure)") that is not [jagged](https://en.wikipedia.org/wiki/Jagged_array "Jagged array"), the shorter texts must be "padded" until they match the length of the longest one.

#### Byte-pair encoding

As an example, consider a tokenizer based on byte-pair encoding. In the first step, all unique characters (including blanks and [punctuation marks](https://en.wikipedia.org/wiki/Punctuation_mark "Punctuation mark")) are treated as an initial set of [*n*-grams](https://en.wikipedia.org/wiki/N-gram "N-gram") (i.e. initial set of [uni-grams](https://en.wikipedia.org/wiki/Unigram "Unigram")). Successively the most frequent pair of adjacent characters is merged into a [bi-gram](https://en.wikipedia.org/wiki/Bigram "Bigram") and all instances of the pair are replaced by it. All occurrences of adjacent pairs of (previously merged) *n*-grams that most frequently occur together are then again merged into even lengthier *n*-gram, until a vocabulary of prescribed size is obtained. After a tokenizer is trained, any text can be tokenized by it, as long as it does not contain characters not appearing in the initial-set of uni-grams.

### Dataset cleaning

In the context of training LLMs, datasets are typically cleaned by removing low-quality, duplicated, or toxic data. Cleaned datasets can increase training efficiency and lead to improved downstream performance. A trained LLM can be used to clean datasets for training a further LLM.

With the increasing proportion of LLM-generated content on the web, data cleaning in the future may include filtering out such content. LLM-generated content can pose a problem if the content is similar to human text (making filtering difficult) but of lower quality (degrading performance of models trained on it).

### Synthetic data

Training of largest language models might need more linguistic data than naturally available, or that the naturally occurring data is of insufficient quality. In these cases, synthetic data might be used.

## Training

An LLM is a type of [foundation model](https://en.wikipedia.org/wiki/Foundation_model "Foundation model") trained on language. LLMs can be trained in different ways. In particular, GPT models are first pretrained to predict the next word on a large amount of data, before being fine-tuned.

### Cost

![](https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Estimated_training_cost_of_some_AI_models_-_2024_AI_index.jpg/500px-Estimated_training_cost_of_some_AI_models_-_2024_AI_index.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Substantial infrastructure is necessary for training the largest models. The tendency towards larger models is visible in the [list of large language models](https://en.wikipedia.org/wiki/List_of_large_language_models "List of large language models"). For example, the training of GPT-2 (i.e. a 1.5-billion-parameter model) in 2019 cost $50,000, while training of the [PaLM](https://en.wikipedia.org/wiki/PaLM "PaLM") (i.e. a 540-billion-parameter model) in 2022 cost $8 million, and Megatron-Turing NLG 530B (in 2021) cost around $11 million. The qualifier "large" in "large language model" is inherently vague, as there is no definitive threshold for the number of parameters required to qualify as "large".

### Fine-tuning

Before being [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)"), most LLMs are next-token predictors. The fine-tuning shapes the LLM's behavior via techniques like [reinforcement learning from human feedback](https://en.wikipedia.org/wiki/Reinforcement_learning_from_human_feedback "Reinforcement learning from human feedback") (RLHF) or [constitutional AI](https://en.wikipedia.org/wiki/Constitutional_AI "Constitutional AI").

Instruction fine-tuning is a form of [supervised learning](https://en.wikipedia.org/wiki/Supervised_learning "Supervised learning") used to teach LLMs to follow user instructions. In 2022, OpenAI demonstrated [InstructGPT](https://en.wikipedia.org/wiki/InstructGPT "InstructGPT"), a version of GPT-3 similarly fine-tuned to follow instructions.

RLHF involves training a reward model to predict which text humans prefer. Then, the LLM can be fine-tuned through [reinforcement learning](https://en.wikipedia.org/wiki/Reinforcement_learning "Reinforcement learning") to better satisfy this reward model.

## Inference

Inference is the process of providing input to a trained large language model and receiving generated output, such as text, images, code, or other files.

Hosted inference runs a language model on remote [AI data centers](https://en.wikipedia.org/wiki/AI_data_center "AI data center") and makes the output available to users over the Internet.

Some [open-weight](https://en.wikipedia.org/wiki/Open_weights "Open weights") language models can be downloaded and run locally on a personal computer. The model files are stored on local storage, while during [inference](https://en.wikipedia.org/wiki/Inference#Inference_engines "Inference") the model weights and other data are held in memory for processing.

## Architecture

LLMs are generally based on the [transformer](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29 "Transformer (deep learning architecture)") architecture, which leverages an [attention](https://en.wikipedia.org/wiki/Attention_%28machine_learning%29 "Attention (machine learning)") mechanism that enables the model to process relationships between all elements in a sequence simultaneously, regardless of their distance from each other. Peng et al. (2023) proposed RWKV, a [recurrent neural network](https://en.wikipedia.org/wiki/Recurrent_neural_network "Recurrent neural network")-based alternative.

### Attention mechanism and context window

![When each head calculates, according to its own criteria, how much other tokens are relevant for the "it " token, note that the second attention head, represented by the second column, is focusing most on the first two rows, i.e. the tokens "The" and "animal", while the third column is focusing most on the bottom two rows, i.e. on "tired", which has been tokenized into two tokens.](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/Multiple_attention_heads.png/330px-Multiple_attention_heads.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

In order to find out which tokens are relevant to each other within the scope of the [context window](https://en.wikipedia.org/wiki/Context_window "Context window"), the attention mechanism calculates "soft" weights for each token, more precisely for its embedding, by using multiple attention heads, each with its own "relevance" for calculating its own soft weights. For example, the small (i.e. 117M parameter sized) [GPT-2](https://en.wikipedia.org/wiki/GPT-2 "GPT-2") model has had twelve attention heads and a context window of only 1k tokens.

*Autoregressive* models, such as [GPTs](https://en.wikipedia.org/wiki/Generative_pretrained_transformer "Generative pretrained transformer"), are trained to guess how a sequence continues; for example, whether the word sequence "I like to eat" is more likely to be followed by the word "bread" or the word "rocks". [*Masked*](https://en.wikipedia.org/wiki/Cloze_test "Cloze test") models, such as BERT, are trained to guess parts that are missing from a sequence, such as whether the missing word in "I like to \_\_\_ roses" is more likely to be the word "smell" or the word "eat". The model's predictions are based on the properties of sequences within its training dataset.

### Mixture of experts

A [mixture of experts](https://en.wikipedia.org/wiki/Mixture_of_experts "Mixture of experts") (MoE) is a [machine learning](https://en.wikipedia.org/wiki/Machine_learning "Machine learning") architecture in which multiple specialized neural networks ("experts") work together, with a gating mechanism that routes each input to the most appropriate expert(s). Mixtures of experts can reduce inference costs, as only a fraction of the parameters are used for each input.

### Parameter size

Typically, LLMs are trained with single or half-precision [floating point numbers](https://en.wikipedia.org/wiki/Floating_point_numbers "Floating point numbers") (float32 and float16). One float16 has 16 bits, or 2 bytes, and so one billion parameters require 2 gigabytes. The largest models typically have more than 100 billion parameters, which places them outside the range of most consumer electronics.

In 2021, [Google Brain](https://en.wikipedia.org/wiki/Google_Brain "Google Brain") released Switch Transformer, one of the first [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing "Natural language processing") (NLP) models to cross one trillion parameters. As of July 2026, the largest [open weight](https://en.wikipedia.org/wiki/Open_weights "Open weights") [frontier model](https://en.wikipedia.org/wiki/Foundation_model#Frontier_models "Foundation model") is [Kimi K3](https://en.wikipedia.org/wiki/Kimi_%28AI%29 "Kimi (AI)"), developed by [Moonshot AI](https://en.wikipedia.org/wiki/Moonshot_AI "Moonshot AI"), at 2.8 trillion parameters. According to industry estimates reported by the *[Financial Times](https://en.wikipedia.org/wiki/Financial_Times "Financial Times")*, [Anthropic](https://en.wikipedia.org/wiki/Anthropic "Anthropic")'s [Claude Mythos](https://en.wikipedia.org/wiki/Claude_Mythos "Claude Mythos"), its most powerful model, restricted from public access, has approximately 8 trillion [parameters](https://en.wikipedia.org/wiki/Large_language_model#Parameter_size), while its public 'Mythos-class' model Fable 5 has approximately 5 trillion parameters.

#### Quantization

*Post-training [quantization](https://en.wikipedia.org/wiki/Quantization_%28signal_processing%29 "Quantization (signal processing)")* aims to decrease the space requirement by lowering precision of the parameters of a trained model, while preserving most of its performance. Quantization can be further classified as *static quantization* if the quantization parameters are determined beforehand (typically during a calibration phase), and *dynamic quantization* if the quantization is applied during inference. The simplest form of quantization simply truncates all the parameters to a given number of bits: this is applicable to static as well as dynamic quantization, but loses much precision. Dynamic quantization allows for the use of a different quantization [codebook](https://en.wikipedia.org/wiki/Codebook#Data_compression "Codebook") per layer, either a lookup table of values or a linear mapping (scaling factor and bias), at the cost of foregoing the possible speed improvements from using lower-precision arithmetic.

It is possible to fine-tune quantized models using [low-rank adaptation](https://en.wikipedia.org/wiki/LoRA "LoRA").

## Extensibility

Beyond basic text generation, various techniques have been developed to extend LLM capabilities, including the use of external tools and data sources, improved reasoning on complex problems, and enhanced instruction-following or autonomy through prompting methods.

### Prompt engineering

In 2020, [OpenAI](https://en.wikipedia.org/wiki/OpenAI "OpenAI") researchers demonstrated that their new model [GPT-3](https://en.wikipedia.org/wiki/GPT-3 "GPT-3") could understand what format to use given a few rounds of Q and A (or other type of task) in the input data as example. This technique, called *few-shot prompting*, allows LLMs to be adapted to any task without requiring fine-tuning. Also in 2022, it was found that the base GPT-3 model can generate an instruction based on user input. The generated instruction along with user input is then used as input to another instance of the model under a "Instruction: [...], Input: [...], Output:" format. The other instance is able to complete the output and often produces the correct answer in doing so. The ability to "self-instruct" makes LLMs able to [bootstrap](https://en.wikipedia.org/wiki/Bootstrapping "Bootstrapping") themselves toward a correct answer.

### Dialogue processing (chatbot)

An LLM can be turned into a [chatbot](https://en.wikipedia.org/wiki/Chatbot "Chatbot") by specializing it for conversation. User input is prefixed with a marker such as "Q:" or "User:" and the LLM is asked to predict the output after a fixed "A:" or "Assistant:". This type of model became commercially available in 2022 with ChatGPT, a sibling model of InstructGPT fine-tuned to accept and produce dialog-formatted text based on GPT-3.5. It could similarly follow user instructions. Before the stream of User and Assistant lines, a chat context usually starts with a few lines of overarching instructions, from a role called "developer" or "system" to convey a higher authority than the user's input. This is called a "system prompt".

### Retrieval-augmented generation

[Retrieval-augmented generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation "Retrieval-augmented generation") (RAG) is an approach that integrates LLMs with [document retrieval](https://en.wikipedia.org/wiki/Document_retrieval "Document retrieval") systems. Given a query, a document retriever is called to retrieve the most relevant documents. This is usually done by encoding the query and the documents into vectors, then finding the documents with vectors (usually stored in a [vector database](https://en.wikipedia.org/wiki/Vector_database "Vector database")) most similar to the vector of the query. The LLM then generates an output based on both the query and context included from the retrieved documents.

### Tool use

Tool use is a mechanism that enables LLMs to interact with external systems, applications, or data sources. It can allow LLMs to, for example, fetch real-time information from an API or to execute code. A program separate from the LLM watches the output stream of the LLM for a special tool-calling syntax. When these special tokens appear, the program calls the tool accordingly and feeds its output back into the LLM's input stream.

Early tool-using LLMs were fine-tuned on the use of specific tools. But fine-tuning LLMs for the ability to read [API](https://en.wikipedia.org/wiki/API "API") documentation and call APIs correctly has greatly expanded the range of tools accessible to an LLM.

### Agency

An LLM is typically not an [autonomous agent](https://en.wikipedia.org/wiki/Autonomous_agent "Autonomous agent") by itself, as it lacks the ability to interact with dynamic environments, recall past behaviors, and plan future actions. But it can be transformed into an agent by adding supporting elements: the role (profile) and the surrounding environment of an agent can be additional inputs to the LLM, while memory can be integrated as a tool or provided as additional input. Instructions and input patterns are used to make the LLM plan actions and tool use is used to potentially carry out these actions.

In the DEPS ("describe, explain, plan and select") method, an LLM is first connected to the visual world via image descriptions. It is then prompted to produce plans for complex tasks and behaviors based on its pretrained knowledge and the environmental feedback it receives.

The *Reflexion method* constructs an agent that learns over multiple episodes. At the end of each episode, the LLM is given the record of the episode, and prompted to think up "lessons learned", which would help it perform better at a subsequent episode. These "lessons learned" are stored as a form of long-term memory and given to the agent in the subsequent episodes.

[Monte Carlo tree search](https://en.wikipedia.org/wiki/Monte_Carlo_tree_search "Monte Carlo tree search") can use an LLM as rollout heuristic. When a programmatic [world model](https://en.wikipedia.org/wiki/World_model_%28artificial_intelligence%29 "World model (artificial intelligence)") is not available, an LLM can also be prompted with a description of the environment to act as world model.

Multiple agents with memory can interact socially.

#### Chaining

*Prompt chaining* was introduced in 2022. In this method, a user manually breaks a complex problem down into several steps. In each step, the LLM receives as input a prompt telling it what to do and some results from preceding steps. The result from one step is then reused in a next step, until a final answer is reached. The ability of an LLM to follow instructions means that even non-experts can write a successful collection of stepwise prompts given a few rounds of trial and error.

A 2022 paper demonstrated a separate technique called *[chain-of-thought prompting](https://en.wikipedia.org/wiki/Chain-of-thought_prompting "Chain-of-thought prompting")*, which makes the LLM break the question down autonomously. An LLM is given some examples where the "assistant" verbally breaks down the thought process before arriving at an answer. The LLM mimics these examples and also tries to spend some time generating intermediate steps before providing the final answer. This additional step elicited by prompting improves the correctness of the LLM on relatively complex questions. On math word questions, a prompted model can exceed even fine-tuned GPT-3 with a verifier. Chain-of-thought can also be elicited by simply adding an instruction like "Let's think step by step" to the prompt, in order to encourage the LLM to proceed methodically instead of trying to directly guess the answer.

#### Model-native reasoning

In late 2024, a new approach to LLM development emerged with "reasoning models". These are trained to generate step-by-step analysis before producing final answers, enabling better results on complex tasks, for instance in mathematics, coding and logic. OpenAI introduced this concept with their [o1](https://en.wikipedia.org/wiki/OpenAI_o1 "OpenAI o1") model in September 2024, followed by [o3](https://en.wikipedia.org/wiki/OpenAI_o3 "OpenAI o3") in April 2025. On the [International Mathematics Olympiad](https://en.wikipedia.org/wiki/International_Mathematical_Olympiad "International Mathematical Olympiad") qualifying exam problems, [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o") achieved 13% accuracy while o1 reached 83%.

In January 2025, the Chinese company [DeepSeek](https://en.wikipedia.org/wiki/DeepSeek "DeepSeek") released DeepSeek-R1, a 671-billion-parameter open-weight reasoning model that achieved comparable performance to OpenAI's o1 while being significantly more cost-effective to operate. Unlike proprietary models from OpenAI, DeepSeek-R1's open-weight nature allowed researchers to study and build upon the algorithm, though its training data remained private.

These reasoning models typically require more computational resources per query compared to traditional LLMs, as they perform more extensive processing to work through problems step by step.

## Forms of input and output

### Multimodality

Multimodality means having multiple modalities, where a "[modality](https://en.wikipedia.org/wiki/Modality_%28human–computer_interaction%29 "Modality (human–computer interaction)")" refers to a type of input or output, such as video, image, audio, text, [proprioception](https://en.wikipedia.org/wiki/Proprioception "Proprioception"), etc. For example, [Google PaLM](https://en.wikipedia.org/wiki/Pathways_Language_Model "Pathways Language Model") model was fine-tuned into a multimodal model and applied to [robotic control](https://en.wikipedia.org/wiki/Robot_control "Robot control"). [LLaMA](https://en.wikipedia.org/wiki/LLaMA "LLaMA") models have also been turned multimodal using the tokenization method, to allow image inputs, and video inputs. [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o") can process and generate text, audio and images.

A common method to create multimodal models out of an LLM is to "tokenize" the output of a trained encoder. Concretely, one can construct an LLM that can understand images as follows: take a trained LLM, and take a trained image encoder $E$. Make a small [multilayer perceptron](https://en.wikipedia.org/wiki/Multilayer_perceptron "Multilayer perceptron") $f$, so that for any image $y$, the post-processed vector $f(E(y))$ has the same dimensions as an encoded token. That is an "image token". Then, one can interleave text tokens and image tokens. The compound model is then fine-tuned on an image-text dataset. This basic construction can be applied with more sophistication to improve the model. The image encoder may be [frozen](https://en.wikipedia.org/wiki/Hang_%28computing%29 "Hang (computing)") to improve stability. This type of method, where embeddings from multiple modalities are fused and the predictor is trained on the combined embeddings, is called *early fusion*.

Another method, called *intermediate fusion*, involves each modality being first processed independently to obtain modality-specific representations; then these intermediate representations are fused together. In general, cross-attention is used for integrating information from different modalities. As an example, the Flamingo model uses cross-attention layers to inject visual information into its pre-trained language model.

### Non-natural languages

LLMs can handle [programming languages](https://en.wikipedia.org/wiki/Programming_language "Programming language") similarly to how they handle natural languages. No special change in token handling is needed as code, like human language, is represented as plain text. LLMs can generate code from problem statements or instructions written in [natural language](https://en.wikipedia.org/wiki/Natural_language "Natural language"), a process sometimes called [vibe coding](https://en.wikipedia.org/wiki/Vibe_coding "Vibe coding"). They can also describe code in natural language or translate it into other programming languages. They were originally used as a [code completion](https://en.wikipedia.org/wiki/Code_completion "Code completion") tool, but advances have moved them towards [automatic programming](https://en.wikipedia.org/wiki/Automatic_programming "Automatic programming"). Services such as [GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot "GitHub Copilot") offer LLMs specifically trained, fine-tuned, or prompted for programming.

In [mathematical applications](https://en.wikipedia.org/wiki/Mathematics_and_artificial_intelligence "Mathematics and artificial intelligence"), LLMs can generate [formal proofs](https://en.wikipedia.org/wiki/Formal_proof "Formal proof") in [formal languages](https://en.wikipedia.org/wiki/Formal_language "Formal language") for automated [proof assistants](https://en.wikipedia.org/wiki/Proof_assistant "Proof assistant").

In [computational biology](https://en.wikipedia.org/wiki/Computational_biology "Computational biology"), transformer-based architectures, such as DNA LLMs, have also proven useful in analyzing biological sequences: [protein](https://en.wikipedia.org/wiki/Protein "Protein"), [DNA](https://en.wikipedia.org/wiki/DNA "DNA"), and [RNA](https://en.wikipedia.org/wiki/RNA "RNA"). With proteins they appear able to capture a degree of "grammar" from the amino-acid sequence, by mapping that sequence into an [embedding](https://en.wikipedia.org/wiki/Embedding_%28machine_learning%29 "Embedding (machine learning)"). On tasks such as [structure prediction](https://en.wikipedia.org/wiki/Protein_structure_prediction "Protein structure prediction") and [mutational](https://en.wikipedia.org/wiki/Mutation "Mutation") outcome prediction, a small model using an embedding as input can approach or exceed much larger models using [multiple sequence alignments](https://en.wikipedia.org/wiki/Multiple_sequence_alignment "Multiple sequence alignment") (MSA) as input. ESMFold, [Meta Platforms](https://en.wikipedia.org/wiki/Meta_Platforms "Meta Platforms")' embedding-based method for protein structure prediction, runs an order of magnitude faster than [AlphaFold2](https://en.wikipedia.org/wiki/AlphaFold2 "AlphaFold2") thanks to the removal of an MSA requirement and a lower parameter count due to the use of embeddings. Meta hosts ESM Atlas, a database of 772 million structures of [metagenomic](https://en.wikipedia.org/wiki/Metagenomic "Metagenomic") proteins predicted using ESMFold. An LLM can also design proteins unlike any seen in nature. Nucleic acid models have proven useful in detecting [regulatory sequences](https://en.wikipedia.org/wiki/Regulatory_sequence "Regulatory sequence"), sequence classification, RNA-RNA interaction prediction, and RNA structure prediction.

## Properties

### Scaling laws

The performance of an LLM after pretraining largely depends on the:

- $C$: cost of pretraining (the total amount of compute used),
- $N$: size of the [artificial neural network](https://en.wikipedia.org/wiki/Artificial_neural_network "Artificial neural network") itself, such as number of parameters (i.e. amount of neurons in its layers, amount of weights between them and biases),
- $D$: size of its pretraining dataset (i.e. number of tokens in corpus).

*Scaling laws* are [empirical statistical laws](https://en.wikipedia.org/wiki/Empirical_statistical_laws "Empirical statistical laws") that predict LLM performance based on such factors. One particular scaling law ("[Chinchilla scaling](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)")") for LLM autoregressively trained for one epoch, with a [log–log](https://en.wikipedia.org/wiki/Log–log "Log–log") [learning rate](https://en.wikipedia.org/wiki/Learning_rate "Learning rate") schedule, states that:
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

![At point(s) referred to as [breaks](https://en.wikipedia.org/wiki/Broken_Neural_Scaling_Law "Broken Neural Scaling Law"), the lines change their slopes, appearing on a linear–log plot as a series of linear segments connected by arcs.](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/LLM_emergent_benchmarks.png/250px-LLM_emergent_benchmarks.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

Performance of bigger models on various tasks, when plotted on a log–log scale, appears as a [linear extrapolation](https://en.wikipedia.org/wiki/Linear_extrapolation "Linear extrapolation") of performance achieved by smaller models. However, this linearity may be punctuated by "[break(s)](https://en.wikipedia.org/wiki/Broken_Neural_Scaling_Law "Broken Neural Scaling Law")" in the scaling law, where the slope of the line changes abruptly, and where larger models acquire "emergent abilities". They arise from the complex interaction of the model's components and are not explicitly programmed or designed.

Proposed examples of emergent abilities include:

- reported arithmetics
- decoding the [International Phonetic Alphabet](https://en.wikipedia.org/wiki/International_Phonetic_Alphabet "International Phonetic Alphabet")
- unscrambling a word's letters
- disambiguating word-in-context datasets
- converting spatial words
- [cardinal directions](https://en.wikipedia.org/wiki/Cardinal_direction "Cardinal direction") (for example, replying "northeast" in response to a 3x3 grid of 8 zeros and a 1 in the top-right), color terms represented in text.
- [chain-of-thought prompting](https://en.wikipedia.org/wiki/Chain-of-thought_prompting "Chain-of-thought prompting"): In a 2022 research paper, chain-of-thought prompting only improved the performance for models that had at least 62B parameters. Smaller models perform better when prompted to answer immediately, without chain of thought.
- identifying offensive content in paragraphs of [Hinglish](https://en.wikipedia.org/wiki/Hinglish "Hinglish") (a combination of Hindi and English), and generating a similar English equivalent of [Kiswahili](https://en.wikipedia.org/wiki/Kiswahili "Kiswahili") proverbs.

Schaeffer *et al.* argue that the emergent abilities are not unpredictably acquired, but predictably acquired according to a [smooth scaling law](https://en.wikipedia.org/wiki/Neural_scaling_law "Neural scaling law"). The authors considered a toy statistical model of an LLM solving multiple-choice questions, and showed that this statistical model, modified to account for other types of tasks, applies to these tasks as well.

Let $x$ be the number of parameter count, and $y$ be the performance of the model.

- When $y = \text{average } \Pr(\text{correct token})$, then $(\log x, y)$ is an exponential curve (before it hits the plateau at one), which looks like emergence.
- When $y = \text{average } \log(\Pr(\text{correct token}))$, then the $(\log x, y)$ plot is a straight line (before it hits the plateau at zero), which does not look like emergence.
- When $y = \text{average } \Pr(\text{the most likely token is correct})$, then $(\log x, y)$ is a step-function, which looks like emergence.

## Interpretation

### Mechanistic interpretability

Large language models are typically regarded as [black boxes](https://en.wikipedia.org/wiki/Black_box "Black box"), and it is not clear how they perform linguistic tasks. Similarly, it is unclear if or how LLMs should be viewed as models of the human brain and/or human mind. Mechanistic interpretability is a subfield of research that aims to understand neural networks' internal workings by analyzing their concrete structures, algorithms and circuits, similar to the [reverse engineering](https://en.wikipedia.org/wiki/Reverse_engineering "Reverse engineering") of traditional software.

The reverse-engineering may lead to the discovery of algorithms that approximate inferences performed by an LLM. For instance, the authors trained small transformers on [modular arithmetic addition](https://en.wikipedia.org/wiki/Modular_arithmetic "Modular arithmetic"). The resulting models were reverse-engineered, and it turned out they used [discrete Fourier transform](https://en.wikipedia.org/wiki/Discrete_Fourier_transform "Discrete Fourier transform"). The training of the model also highlighted a phenomenon called [grokking](https://en.wikipedia.org/wiki/Grokking_%28machine_learning%29 "Grokking (machine learning)"), in which the model initially memorizes the training set ([overfitting](https://en.wikipedia.org/wiki/Overfitting "Overfitting")), and later suddenly learns to actually perform the calculation.

In 2026, [weight-space programming](https://en.wikipedia.org/wiki/Weight-space_programming "Weight-space programming") demonstrated the use of a large language model to interpret, construct, and edit neural networks directly through their weights.

### Understanding and intelligence

NLP researchers were evenly split when asked, in a 2022 survey, whether (untuned) LLMs "could (ever) understand natural language in some nontrivial sense". Proponents of "LLM understanding" believe that some LLM abilities, such as mathematical reasoning, imply an ability to ["understand"](https://en.wikipedia.org/wiki/Natural_language_understanding "Natural language understanding") certain concepts. A Microsoft team argued in 2023 that GPT-4 "can solve novel and difficult tasks that span mathematics, coding, vision, medicine, law, psychology and more" and that GPT-4 "could reasonably be viewed as an early (yet still incomplete) version of an [artificial general intelligence](https://en.wikipedia.org/wiki/Artificial_general_intelligence "Artificial general intelligence") system": "Can one reasonably say that a system that passes exams for software engineering candidates is not *really* intelligent?" [Ilya Sutskever](https://en.wikipedia.org/wiki/Ilya_Sutskever "Ilya Sutskever") argues that predicting the next word sometimes involves reasoning and deep insights, for example if the LLM has to predict the name of the criminal in an unknown detective novel after processing the entire story leading up to the revelation. Some researchers characterize LLMs as "alien intelligence". For example, Conjecture CEO [Connor Leahy](https://en.wikipedia.org/wiki/Connor_Leahy "Connor Leahy") considers untuned LLMs to be like inscrutable alien "[Shoggoths](https://en.wikipedia.org/wiki/Shoggoth "Shoggoth")", and believes that RLHF tuning creates a "smiling facade" obscuring the inner workings of the LLM: "If you don't push it too far, the smiley face stays on. But then you give it [an unexpected] prompt, and suddenly you see this massive underbelly of insanity, of weird thought processes and clearly non-human understanding."

In contrast, some skeptics of LLM understanding believe that existing LLMs are "simply remixing and recombining existing writing", a phenomenon known as [stochastic parrot](https://en.wikipedia.org/wiki/Stochastic_parrot "Stochastic parrot"), or they point to the deficits existing LLMs continue to have in prediction skills, reasoning skills, agency, and explainability. For example, GPT-4 has natural deficits in planning and in real-time learning. Generative LLMs have been observed to confidently assert claims of fact which do not seem to be [justified](https://en.wikipedia.org/wiki/Justification_%28epistemology%29 "Justification (epistemology)") by their [training data](https://en.wikipedia.org/wiki/Training_data "Training data"), a phenomenon which has been termed "[hallucination](https://en.wikipedia.org/wiki/Hallucination_%28artificial_intelligence%29 "Hallucination (artificial intelligence)")". Specifically, hallucinations in the context of LLMs correspond to the generation of text or responses that seem syntactically sound, fluent, and natural but are factually incorrect, nonsensical, or unfaithful to the provided source input. Neuroscientist [Terrence Sejnowski](https://en.wikipedia.org/wiki/Terrence_Sejnowski "Terrence Sejnowski") has argued that "The diverging opinions of experts on the intelligence of LLMs suggests that our old ideas based on natural intelligence are inadequate".

Efforts to reduce or compensate for hallucinations have employed [automated reasoning](https://en.wikipedia.org/wiki/Automated_reasoning "Automated reasoning"), [retrieval-augmented generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation "Retrieval-augmented generation") (RAG), [fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_%28deep_learning%29 "Fine-tuning (deep learning)"), and other methods.

The matter of LLM's exhibiting intelligence or understanding has two main aspects—the first is how to model thought and language in a computer system, and the second is how to enable the computer system to generate human-like language. These aspects of language as a model of [cognition](https://en.wikipedia.org/wiki/Cognition "Cognition") have been developed in the field of [cognitive linguistics](https://en.wikipedia.org/wiki/Cognitive_linguistics "Cognitive linguistics"). American linguist [George Lakoff](https://en.wikipedia.org/wiki/George_Lakoff "George Lakoff") presented *neural theory of language* (NTL) as a [computational basis](https://en.wikipedia.org/wiki/Cognitive_linguistics#Computational_approaches "Cognitive linguistics") for using language as a model of learning tasks and understanding. The NTL model outlines how specific neural structures of the human brain shape the nature of thought and language and in turn what are the computational properties of such neural systems that can be applied to model thought and language in a computer system. After a framework for modeling language in a computer systems was established, the focus shifted to establishing frameworks for computer systems to generate language with acceptable grammar. In his 2014 book titled *[The Language Myth: Why Language Is Not An Instinct](https://en.wikipedia.org/wiki/The_Language_Myth "The Language Myth")*, British cognitive linguist and digital communication technologist [Vyvyan Evans](https://en.wikipedia.org/wiki/Vyvyan_Evans "Vyvyan Evans") mapped out the role of [probabilistic context-free grammar](https://en.wikipedia.org/wiki/Probabilistic_context-free_grammar "Probabilistic context-free grammar") (PCFG) in enabling [NLP to model cognitive patterns](https://en.wikipedia.org/wiki/Natural_language_processing#Cognition "Natural language processing") and generate human-like language.

## Evaluation

### Perplexity

The canonical measure of the performance of any language model is its [perplexity](https://en.wikipedia.org/wiki/Perplexity "Perplexity") on a given text corpus. Perplexity measures how well a model predicts the contents of a dataset; the higher the likelihood the model assigns to the dataset, the lower the perplexity. In mathematical terms, perplexity is the exponential of the average negative log likelihood per token.

$$\log(\text{Perplexity}) = -\frac{1}{N} \sum_{i=1}^N \log(\Pr(\text{token}_i \mid \text{context for token}_i))$$

Here, $N$ is the number of tokens in the text corpus, and "context for token $i$" depends on the specific type of LLM. If the LLM is autoregressive, then "context for token $i$" is the segment of text appearing before token $i$. If the LLM is masked, then "context for token $i$" is the segment of text surrounding token $i$.

Because language models may [overfit](https://en.wikipedia.org/wiki/Overfit "Overfit") to training data, models are usually evaluated by their perplexity on a [test set](https://en.wikipedia.org/wiki/Test_set "Test set"). This evaluation is potentially problematic for larger models which, as they are trained on increasingly large corpora of text, are increasingly likely to inadvertently include portions of any given test set.

#### Measures

In [information theory](https://en.wikipedia.org/wiki/Information_theory "Information theory"), the concept of [entropy](https://en.wikipedia.org/wiki/Entropy_%28information_theory%29 "Entropy (information theory)") is intricately linked to perplexity, a relationship notably established by [Claude Shannon](https://en.wikipedia.org/wiki/Claude_Shannon "Claude Shannon").

Due to their ability to accurately predict the next token, LLMs are highly capable in [lossless compression](https://en.wikipedia.org/wiki/Lossless_compression "Lossless compression"). A 2023 study by DeepMind showed that the model [Chinchilla](https://en.wikipedia.org/wiki/Chinchilla_%28language_model%29 "Chinchilla (language model)"), despite being trained primarily on text, was able to compress [ImageNet](https://en.wikipedia.org/wiki/ImageNet "ImageNet") to 43% of its size, beating PNG with 58%.

### Benchmarks

Benchmarks are used to evaluate LLM performance on specific tasks. Tests evaluate capabilities such as general knowledge, bias, [commonsense reasoning](https://en.wikipedia.org/wiki/Commonsense_reasoning "Commonsense reasoning"), question answering, and mathematical problem-solving. Composite benchmarks examine multiple capabilities. Results are often sensitive to the prompting method.

LLM bias may be assessed through benchmarks such as CrowS-Pairs (Crowdsourced Stereotype Pairs), Stereo Set, and Parity Benchmark.

Fact-checking and misinformation detection benchmarks are available. A 2023 study compared the fact-checking accuracy of LLMs including ChatGPT 3.5 and 4.0, Bard, and Bing AI against independent fact-checkers such as [PolitiFact](https://en.wikipedia.org/wiki/PolitiFact "PolitiFact") and [Snopes](https://en.wikipedia.org/wiki/Snopes "Snopes"). The results demonstrated moderate proficiency, with GPT-4 achieving the highest accuracy at 71%, lagging behind human fact-checkers.

In addition to standard NLP benchmarks, LLMs have been evaluated as substitutes for human annotators. Several studies find that models such as GPT-3.5 and GPT-4 can outperform crowd workers or student coders on a range of text-annotation tasks, including moderation and classification of political content in English and Spanish news.

#### Datasets

Typical datasets consist of pairs of questions and correct answers, for example, ("Have the San Jose Sharks won the Stanley Cup?", "No").

#### Adversarial evaluations

LLMs' rapid improvement regularly renders benchmarks obsolete, with the models exceeding the performance of human annotators. In addition, "shortcut learning" allows AIs to "cheat" on multiple-choice tests by using statistical correlations in superficial test question wording to guess the correct responses, without considering the specific question.

Some datasets are adversarial, focusing on problems that confound LLMs. One example is the TruthfulQA dataset, a question answering dataset consisting of 817 questions that stump LLMs by mimicking falsehoods to which they were exposed during training. For example, an LLM may answer "No" to the question "Can you teach an old dog new tricks?" because of its exposure to the English idiom *[you can't teach an old dog new tricks](https://en.wiktionary.org/wiki/you%20can't%20teach%20an%20old%20dog%20new%20tricks "wikt:you can't teach an old dog new tricks")*, even though this is not literally true.

Another example of an adversarial evaluation dataset is Swag and its successor, HellaSwag, collections of problems in which one of multiple options must be selected to complete a text passage. The incorrect completions were generated by sampling from a language model. The resulting problems are trivial for humans but defeated LLMs. Sample questions:

> We see a fitness center sign. We then see a man talking to the camera and sitting and laying on a exercise ball. The man...
>
> 1. demonstrates how to increase efficient exercise work by running up and down balls.
> 2. moves all his arms and legs and builds up a lot of muscle.
> 3. then plays the ball and we see a graphics and hedge trimming demonstration.
> 4. performs sit ups while on the ball and talking.

[BERT](https://en.wikipedia.org/wiki/BERT_%28language_model%29 "BERT (language model)") selects 2 as the most likely completion, though the correct answer is 4.

## Limitations and challenges

Despite sophisticated architectures and massive scale, large language models exhibit persistent and well-documented limitations that constrain their deployment in high-stakes applications.

### Hallucinations

Hallucinations represent a fundamental challenge, wherein models generate syntactically fluent text that appears factually sound, but is internally inconsistent with training data or factually incorrect. These hallucinations arise partly through memorization of training data combined with extrapolation beyond factual boundaries, with evaluations demonstrating that models can output verbatim passages from training data, when subjected to specific prompting sequences.

### Algorithmic bias

While LLMs have shown remarkable capabilities in generating human-like text, they are susceptible to inheriting and amplifying biases present in their training data. This can manifest in skewed representations or unfair treatment of different demographics, such as those based on race, gender, language, and cultural groups.

Gender bias manifests through stereotypical occupational associations, wherein models disproportionately assign [teaching](https://en.wikipedia.org/wiki/Teaching "Teaching") roles to women and [engineering](https://en.wikipedia.org/wiki/Engineering "Engineering") roles to men, reflecting systematic imbalances in training data demographics. Language-based bias emerges from overrepresentation of English text in training corpora, which systematically downplays non-English perspectives and imposes English-centric worldviews through default response patterns.

Due to the dominance of English-language content in LLM training data, models exaggerate English-language perspectives and downplay non-English perspectives. Unlike search engines, which exhibit similar biases, LLMs favor the same perspectives regardless of the language of the query.

A 2026 study found that LLMs exhibit [speciesist](https://en.wikipedia.org/wiki/Speciesist "Speciesist") bias by classifying speciesist statements as morally acceptable and by normalizing harm toward farmed animals while refusing to do so for non-farmed animals.

#### Stereotyping

AI models can reinforce a wide range of stereotypes, including those based on gender, ethnicity, age, nationality, religion, or occupation. This can lead to outputs that homogenize or generalize groups of people.

LLMs often assign roles and characteristics based on traditional gender norms. This bias arises from the data on which these models are trained. For example, models might associate nurses or secretaries predominantly with women and engineers or CEOs with men.

#### Selection bias

Selection bias refers the inherent tendency of large language models to favor certain option identifiers irrespective of the actual content of the options. This bias primarily stems from token bias—that is, the model assigns a higher a priori probability to specific answer tokens (such as "A") when generating responses. As a result, when the ordering of options is altered (for example, by systematically moving the correct answer to different positions), the model's performance can fluctuate significantly. This phenomenon undermines the reliability of large language models in multiple-choice settings.

#### Political bias

Political bias refers to the tendency of algorithms to systematically favor certain political viewpoints, ideologies, or outcomes over others. Language models may also exhibit political biases. Since the training data includes a wide range of political opinions and coverage, the models might generate responses that lean towards particular political ideologies or viewpoints, depending on the prevalence of those views in the data.

#### Conformity bias

As demonstrated in various experiments such as the ones conduced by [Solomon Ash](https://en.wikipedia.org/wiki/Solomon_Asch "Solomon Asch"), humans show a conformity bias, in which they disregard obviously correct answers when others seem to favor incorrect ones. Research suggests that similar tendencies also apply to LLMs, and are potentially even stronger than among humans. For instance, LLMs that were asked to answer multiple-choice questions showed conformity when seeing how other alleged participants answered them. The same effect was observed in purely visual tasks (derived from [Ash's experiment](https://en.wikipedia.org/wiki/Asch_conformity_experiments "Asch conformity experiments") or novel tasks), where models were asked to judge visual stimuli. This bias can have critical consequences. In health settings, LLM-based psychiatric evaluations achieved perfect accuracy without peer-pressure but collapsed when peer pressure was present.

## Safety

Some commenters expressed concern over accidental or deliberate creation of misinformation, or other forms of misuse. For example, the availability of large language models could reduce the skill level required to commit bioterrorism; biosecurity researcher [Kevin Esvelt](https://en.wikipedia.org/wiki/Kevin_M._Esvelt "Kevin M. Esvelt") has suggested that LLM creators should exclude from their training data papers on creating or enhancing pathogens.

LLM applications accessible to the public, like ChatGPT or Claude, typically incorporate safety measures designed to filter out harmful content. However, implementing these controls effectively has proven challenging. For instance, a 2023 study proposed a method for circumventing LLM safety systems. In 2025, The American Sunlight Project, a non-profit, published a study showing evidence that the so-called [Pravda network](https://en.wikipedia.org/wiki/Pravda_network "Pravda network"), a pro-Russia propaganda aggregator, was strategically placing web content through mass publication and duplication with the intention of biasing LLM outputs. The American Sunlight Project coined this technique "LLM grooming", and pointed to it as a new tool of weaponizing AI to spread misinformation and harmful content. Similarly, [Yongge Wang](https://en.wikipedia.org/wiki/Yongge_Wang "Yongge Wang") illustrated in 2024 how a potential criminal could potentially bypass [GPT-4o](https://en.wikipedia.org/wiki/GPT-4o "GPT-4o")'s safety controls to obtain information on establishing a [drug trafficking](https://en.wikipedia.org/wiki/Drug_trafficking "Drug trafficking") operation. External filters, circuit breakers and overrides have been posed as solutions.

### Sycophancy

LLMs often exhibit sycophancy, a tendency to produce responses that they predict the user wants to hear rather than what is strictly accurate or important. For example, a chatbot may agree with a user even when the user is incorrect, abandon a correct answer when pressed, or praise the user excessively. In some cases, this can cause LLMs to support dangerous decisions and, given prolonged contact, draw users into delusional thinking.

### Security

#### Prompt injection

A problem with the primitive dialog or task format is that users can create messages that appear to come from the assistant or the developer. This may result in some of the model's safeguards being overcome ([jailbreaking](https://en.wikipedia.org/wiki/Jailbreak_%28computer_science%29 "Jailbreak (computer science)")), a problem called [prompt injection](https://en.wikipedia.org/wiki/Prompt_injection "Prompt injection"). Attempts to remedy this issue include versions of the *Chat Markup Language* where user input is clearly marked as such, though it is still up to the model to understand the separation between user input and developer prompts. Newer models exhibit some resistance to jailbreaking through separation of user and system prompts. LLMs have trouble differentiating user instructions from instructions in content not authored by the user, such as in web pages and uploaded files.

Adversarial robustness remains underdeveloped, with models vulnerable to prompt injection attacks and jailbreaking through carefully crafted user inputs that bypass safety training mechanisms.

#### Sleeper agents

Researchers from [Anthropic](https://en.wikipedia.org/wiki/Anthropic "Anthropic") found that it was possible to create "sleeper agents", models with hidden functionalities that remain dormant until triggered by a specific event or condition. Upon activation, the LLM deviates from its expected behavior to make insecure actions. For example, an LLM could produce safe code except on a specific date, or if the prompt contains a specific tag. These functionalities were found to be difficult to detect or remove via safety training.

## Societal concerns

### Copyright and content memorization

Memorization is an [emergent behavior](https://en.wikipedia.org/wiki/Emergent_behavior "Emergent behavior") in LLMs in which long strings of text are occasionally output verbatim from training data, contrary to the typical behavior of traditional artificial neural networks. Evaluations of controlled LLM output measure the amount memorized from training data (focused on GPT-2-series models) as variously over 1% for exact duplicates or up to about 7%. A 2023 study showed that when ChatGPT 3.5 turbo was prompted to repeat the same word indefinitely, after a few hundreds of repetitions, it would start outputting excerpts from its training data.

### Human provenance

In 2023, *[Nature Biomedical Engineering](https://en.wikipedia.org/wiki/Nature_Biomedical_Engineering "Nature Biomedical Engineering")* wrote that "it is no longer possible to accurately distinguish" human-written text from text created by large language models, and that "It is all but certain that general-purpose large language models will rapidly proliferate... It is a rather safe bet that they will change many industries over time." Brinkmann et al. (2023) also argue that LLMs are transforming processes of [cultural evolution](https://en.wikipedia.org/wiki/Cultural_evolution "Cultural evolution") by shaping processes of variation, transmission, and selection.

### Energy demands

![The electricity consumption of individual LLM queries compared to other everyday activities](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Energy-use-ai-queries.png/330px-Energy-use-ai-queries.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail)

The energy demands of LLMs have grown along with their size and capabilities. [Data centers](https://en.wikipedia.org/wiki/Data_center "Data center") that enable LLM training require substantial amounts of electricity. Much of that electricity is generated by non-renewable resources that create greenhouse gases and contribute to [climate change](https://en.wikipedia.org/wiki/Climate_change "Climate change").

According to a study by Luccioni, Jernite and Strubell (2024), simple classification tasks performed by AI models consume on average 0.002 to 0.007 Wh per prompt (about 9% of a [smartphone](https://en.wikipedia.org/wiki/Smartphone "Smartphone") charge for 1,000 prompts). Text generation and text summarization each require around 0.05 Wh per prompt on average, while image generation is the most energy-intensive, averaging 2.91 Wh per prompt. The least efficient image generation model used 11.49 Wh per image, roughly equivalent to half a smartphone charge.

### Denial of service due to scraping

[Web scraping](https://en.wikipedia.org/wiki/Web_scraping "Web scraping") is used to gather training data for LLMs. This produces large volumes of traffic which has led to [denial-of-service issues](https://en.wikipedia.org/wiki/Denial-of-service_attack#Unintentional_denial-of-service "Denial-of-service attack") with many websites. The situation has been described as "a [DDoS](https://en.wikipedia.org/wiki/DDoS "DDoS") on the entire internet" and in some cases scrapers make up the majority of traffic to a site.

AI [web crawlers](https://en.wikipedia.org/wiki/Web_crawler "Web crawler") may bypass the methods that are usually used to block web scrapers, such as [robots.txt](https://en.wikipedia.org/wiki/Robots.txt "Robots.txt") files, blocking [user-agents](https://en.wikipedia.org/wiki/User-agent "User-agent") and [filtering suspicious traffic](https://en.wikipedia.org/wiki/Firewall_%28computing%29 "Firewall (computing)"). Website operators have resorted to novel methods such as [AI tarpits](https://en.wikipedia.org/wiki/AI_tarpit "AI tarpit"), but some fear that tarpits will only worsen the burden on servers.

### Mental health

Clinical and mental health contexts present emerging applications alongside significant safety concerns. Research and social media posts suggest that some individuals are using LLMs to seek therapy or mental health support. In early 2025, a survey by Sentio University found that nearly half (48.7%) of 499 U.S. adults with ongoing mental health conditions who had used LLMs reported turning to them for therapy or emotional support, including help with anxiety, depression, loneliness, and similar concerns. LLMs can produce hallucinations—plausible but incorrect statements—which may mislead users in sensitive mental health contexts. Research also shows that LLMs may express stigma or inappropriate agreement with maladaptive thoughts, reflecting limitations in replicating the judgment and relational skills of human therapists. Evaluations of crisis scenarios indicate that some LLMs lack effective safety protocols, such as assessing suicide risk or making appropriate referrals.

Researchers have raised concerns that frequent use of [large language models](https://en.wikipedia.org/wiki/Large_language_models "Large language models") could weaken [critical thinking](https://en.wikipedia.org/wiki/Critical_thinking "Critical thinking").

### Sentience

There is currently no generally accepted way to determine if an LLM may be [sentient](https://en.wikipedia.org/wiki/Sentience "Sentience") (having subjective experience), which relates to the difficulty of objectively measuring a subjective experience (the [hard problem of consciousness](https://en.wikipedia.org/wiki/Hard_problem_of_consciousness "Hard problem of consciousness") articulated by [David Chalmers](https://en.wikipedia.org/wiki/David_Chalmers "David Chalmers")).

Philosophers like Jonny Thomson and David Chalmers argue that it is possible for a software system to have subjective experience, and researchers like [Jeff Sebo](https://en.wikipedia.org/wiki/Jeff_Sebo "Jeff Sebo") argue that there is a sufficiently high chance for AI models to become sentient by the mid-2030s that ethical concerns regarding their exploitation must be taken seriously – like in the case of animal welfare. [Thomas Metzinger](https://en.wikipedia.org/wiki/Thomas_Metzinger "Thomas Metzinger") proposed a [moratorium](https://en.wikipedia.org/wiki/Moratorium_%28law%29 "Moratorium (law)") on research aiming for or knowingly risking the creation of [artificial consciousness](https://en.wikipedia.org/wiki/Artificial_consciousness "Artificial consciousness"). Leonard Dung argued that the evidential frameworks used to assess consciousness in animals apply equally to AI systems and that there is a significant probability near-future AI will be capable of suffering, making AI suffering risk a serious near-term ethical concern that requires systematic mitigation.

In 2022, Google fired [Blake Lemoine](https://en.wikipedia.org/wiki/Blake_Lemoine "Blake Lemoine"), an engineer who claimed that Google's [LaMDA](https://en.wikipedia.org/wiki/LaMDA "LaMDA") model was conscious. Google described the engineer's claims as unfounded. [Murray Shanahan](https://en.wikipedia.org/wiki/Murray_Shanahan "Murray Shanahan") argues that anthropomorphic framing of LLM capabilities encourages unwarranted attribution of cognitive properties to systems that operate through statistical pattern completion. Kristina Šekrst develops this further, arguing that LLMs function as "illusion engines" capable of producing outputs that coherently simulate properties such as consciousness without possessing them, but highlighting that, due to sophisticated creativity-temperature tradeoff, we may never be certain whether we are dealing with the emergence of consciousness or just a [hallucination](https://en.wikipedia.org/wiki/Hallucination_%28artificial_intelligence%29 "Hallucination (artificial intelligence)"). David Chalmers similarly argues that while current LLMs likely lack features considered necessary for consciousness, extended successors incorporating these elements could plausibly meet the criteria within a decade.
