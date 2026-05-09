# 3.1 Introduction to Object-Oriented Programming

We have seen that every object in a Python program has a type,
and that an object's type governs both its possible values
and the operations that can be performed on it.
As the data we want to store and manipulate gets more complex,
Python's built-in types begin to feel inadequate.
Fortunately, we can create our own custom types.


## Consider Twitter

[Twitter](https://twitter.com) (now called [X](https://www.theverge.com/2023/7/23/23804629/twitters-rebrand-to-x-may-actually-be-happening-soon))
is an application
that allows users to broadcast short messages, called tweets.
If we wanted to write a program like Twitter,
we would certainly need to be able to represent a tweet in our program, including the user who wrote the tweet, when the tweet was created, the contents of the tweet,  and how many "likes" the tweet has.
How would we do so?

We could store the data associated with a single tweet in a list,

```python
['David', '2017-09-19', 'Hello, I am so cool', 0]
```

or a dictionary,

```python
{
    'userid': 'David',
    'created_at': '2017-09-19',
    'content': 'Hello, I am so cool',
    'likes': 0
}
```
and then pass such objects around from function to function as needed.

You might find it interesting to compare the relative merits of the list vs.
dictionary approach.
But there is a serious problem with using either of them:
nothing would prevent us from creating a malformed tweet object.
For example, if we used a list, we could:

-   Create a malformed tweet, for instance with the values in the wrong order, such as
    `[55, 'Diane', 'Older and even cooler', '2017-09-19']`.
-   Ruin a well-formed tweet by calling `pop`,
    which would remove the record of the number of people who liked the tweet.

If we used a dictionary, we could:

-   Create a malformed tweet, for instance one that is missing the date:
    ```python
    {
        'userid': 'Jacqueline',
        'content': 'Has the most dignified cat',
        'likes': 12
    }
    ```
-   Ruin a well-formed tweet by adding a new key-value pair that has nothing to do with tweets, for example by doing `t['units'] = 'centimeters'`.

Furthermore, with either a list or a dictionary, nothing would enforce the 280-character limit that Twitter imposes on tweets.

Notice that this objection is one of *protecting against errors*,
and not one of absolute correctness.
That is,
it is certainly possible to write a perfectly correct program that
represents tweets using lists or dictionaries---you'll just probably
make lots of mistakes along the way.
A better solution is to create an entirely new data type for tweets.
<!-- We do this by defining a **class**. -->
This will allow us to specify the structure of the data precisely, and
to control the operations that are performed on the data
so that the data always remains well-formed.


## Defining a class: attributes

<!-- A **class** is a block of code that defines a type of data.
The built-in Python types that you're familiar with like `int`, `str`, and `list` are all defined by classes. -->
A **class** is a formal name for a type of data in Python.
The built-in Python types that you're familiar with like `int`, `str`, and `list` are all classes.
Suppose we have a class called `X`.
An object whose type is `X` is called an **instance** of class `X`;
for example, the object `3` is an instance of class `int`.

An instance of a class does not have to contain
just a single piece of data as an `int` does;
it can hold a collection of data bundled together.
Each individual piece of data in an instance is called
an **instance attribute** of the object.[^1]
For example, a tweet could possess an instance attribute for
the content of the tweet,
and another for the user ID of the person who wrote the tweet.
Classes can have an arbitrary number of attributes,
and they can all be of different types:
integers, floats, strings, lists, dictionaries, and even other classes.

Let's now see how to actually do this in Python.
First, we pick the name of the class, which is usually a capitalized noun.
In this case, we'll pick `Tweet`.
We then write a docstring for the class,
which gives a description of both the class
and all the instance attributes of that class.

```python
class Tweet:
    """A tweet, like in Twitter.

    Attributes:
        userid: the id of the user who wrote the tweet.
        created_at: the date the tweet was written.
        content: the contents of the tweet.
        likes: the number of likes this tweet has received.
    """
```

### Documenting attribute types in PyCharm

Below the docstring, we declare the type of every instance attribute;
the syntax for doing so is `<attribute_name>: <attribute_type>`.
For example, the first few lines in the `Tweet` class would be:

```python
from datetime import date # We are using a library to represent dates


class Tweet:
    """A tweet, like in Twitter.

    Attributes:
        userid: the id of the user who wrote the tweet.
        created_at: the date the tweet was written.
        content: the contents of the tweet.
        likes: the number of likes this tweet has received.
    """
    # Attribute types
    userid: str
    created_at: date
    content: str
    likes: int
```

As we discussed in [1.5 Type Annotations](../python-recap/type_annotations.md), this Python syntax enables programming tools,
including PyCharm, to check the types of attributes
as we give them values and modify their values throughout our code.
Don't be fooled by the similarity to other programming languages, though!
These type annotations do not create the instance variables.
In fact, they *have no effect when the program runs*, and could actually be removed without changing the behaviour of our code.
However, it is good practice to include these because, as we said, they can be understood by automated tools.

Notice that we have to document the instance attributes in two places:
in the docstring (to specify their meaning) and
below it (to specify their types).
While this is a little awkward, keep in mind that each form of documentation serves an important purpose.
Users must know the meaning of the instance attributes of a class in order to use the class,
and the information needs to be in the docstring so that `help` can find it.
Automated tools read the attribute types to help us write our code and detect bugs,
and they require that the information be in the class body rather than the docstring.
<!--Dan: I wonder if we should introduce the types of instance variables _after_ introducing __init__. It feels backwards right now.-->


### Creating an instance of a class

After writing only this much in the class body,
we have defined a new type!
We can import this class and then create an instance of it like this:

```python
>>> tweet = Tweet()
```

This creates a new `Tweet` object and stores a reference to it
in the variable `tweet`.


### Defining an initializer

At this point, the new object doesn't contain any data.

```python
>>> tweet = Tweet()
>>> tweet.userid
AttributeError: 'Tweet' object has no attribute 'userid'
```

The error makes sense.
Remember that a type annotation does not create a variable, so all we have in memory is this:

<img src="images/Construct-empty-crop.jpg" alt="An empty instance of Tweet" width="500">

In order to create and initialize instance attributes for an instance of a class,
we define a special method inside the class called `__init__`,
or in English the **initializer**.[^2]
Here is the header for an initializer method for our `Tweet` class:

```python
class Tweet:
    # previous content omitted for brevity

    def __init__(self, who: str, when: date, what: str) -> None:
        """Initialize a new Tweet.
        """
```

You are likely wondering what the parameter `self` is for.
Every initializer has a first parameter
that refers to the instance that has just been created and is to be initialized.
By convention, we always call it `self`.
This is such a strong Python convention that
most code checkers will complain if you don't follow it.

To understand how `self` works, let's examine how we use the initializer:

```python
>>> from datetime import date
>>> t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')
```

Notice that we never mention the initializer `__init__` by name;
it is called automatically, and the values in parentheses are passed to it.
Also notice that we pass three values to the initializer, even though it has four parameters.
We never have to pass a value for `self`;
it automatically receives the id of the instance that is to be initialized.
So this is what is happening in memory at the beginning of the initializer:

<img src="images/Construct-step2a-crop.jpg"
     alt="The state of memory at the beginning of the initializer"
     width="500">

The initializer's job is to create and initialize the instance attributes.
Let's write the code to do this for the attribute `userid`.
In the case of our example, we want to add to the new `Tweet` object as follows:

<img src="images/Construct-almost-step2b-crop.jpg"
     alt="How we want the instance attribute userid to be set up."
     width="500">

This will require an assignment statement.
What will go on the left side?
We need to create a new variable called `userid`, but if we write
`userid = ...` (we will figure out the right side in a moment),
this will create a new variable called `userid` in the stack frame.
We need to put it in the new object instead.
Fortunately, `self` refers to the new object, and we can "go into" the object by writing `self` followed by a dot '`.`'.[^3]

So our assignment statement will be `self.userid = ...`.
What goes on the right side?
We need to get `id1` into the new attribute.
Our parameter `who` stores that,
and we have access to it because it is in our stack frame.
So the assignment statement will be `self.userid = who`.
We have just created an instance attribute!

Here is the full initializer method:

```python
class Tweet:
    # previous content omitted for brevity

    def __init__(self, who: str, when: date, what: str) -> None:
        """Initialize a new Tweet.
        """
        self.userid = who
        self.created_at = when
        self.content = what
        self.likes = 0
```

By the time the initializer is about to return,
we have created four instance attributes in total and
this is the state of memory:

<img src="images/Construct-step2b-crop.jpg"
     alt="The state of memory at the end of the initializer"
     width="500">

and after we return, we can assign the id of the new object to `t1`:

<img src="images/Construct-step3-crop.jpg"
     alt="The state of memory after the initializer"
     width="500">

With the new object properly set up and a reference to it stored,
we can access each of its attributes by using dot notation.

```python
>>> from datetime import date
>>> t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')
>>> t1.userid
'Giovanna'
>>> t1.created_at
datetime.date(2017, 9, 18)
>>> t1.content
'Hello'
>>> t1.likes
0
```

Notice that we let the client code choose initial values for attributes
`who`, `when`, and `what`, through passing arguments to the initializer.
We do not give the client code control over the initial value for `likes`;
instead, every `Tweet` object begins with zero likes.
This was simply a design decision.
For any initializer you write,
you will have to decide which attributes will have an initial value
that the client code gets control over.


### What really happens when we create a new object

Our initializer differs from the functions you are familiar with in important ways:

-   As noted above, an initializer always has a first parameter called `self`, and we never have to pass a value for `self`.
-   By convention, we omit a type annotation for `self`.
    This is because the type of `self` should *always* be the class that this method belongs to (in our example, this is `Tweet`).

As we will see, these differences show up in all methods that we write.

You may also notice that the return type of the initializer is `None`, and yet a call to the initializer seems to return the new instance.
This makes sense once we know that creating a `Tweet` doesn't just cause `__init__` to be called.
It actually does three things:[^4]

1.  Create a new `Tweet` object behind the scenes.
2.  Call `__init__` with the new object passed to the parameter `self`,
    along with the other three arguments (for `who`, `when`, and `what`).
3.  Return the new object.
    This step is where the object is returned, not directly from the call to `__init__` in Step 2.


### Revisiting the terminology

Once we define the `Tweet` class, how many `Tweet` objects can we construct?
There is no limit.
Each one is an object that is an instance of class `Tweet`.
Suppose we create 25 `Tweet` objects.
How many `content` variables have we created?
25.
There is one for each instance of `Tweet`.
This is why we call it an *instance* attribute.

A class definition acts as a *blueprint* or *template*:
its code specifies what attributes every single instance of that class will have.
This allows us to enforce a common structure on all data of the given type,
which is one of the main purposes of having a type!


## Defining a class: methods

Now that we have our new data type,
we can write functions that take in tweets as arguments,
or even create and return a new tweet!
Here are two simple examples:

```python
def like(tweet: Tweet, n: int) -> None:
    """Record the fact that <tweet> received <n> likes.

    Precondition: n >= 0

    >>> t = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
    >>> like(t, 3)
    >>> t.likes
    3
    """
    tweet.likes += n


def retweet(new_user: str, tweet: Tweet, new_date: date) -> Tweet:
    """Create a copy of the given tweet with the new user and date.

    The new tweet has 0 likes, regardless of the number of likes of the
    original tweet.

    >>> t1 = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
    >>> t2 = retweet('Calliope', t1, date(2017, 9, 18))
    >>> t2.userid
    'Calliope'
    >>> t2.created_at
    datetime.date(2017, 9, 18)
    >>> t2.content
    'Hey!'
    >>> t2.likes
    0
    """
    return Tweet(new_user, new_date, tweet.content)
```

While it is certainly possible to accomplish everything that we would ever want to do with our `Tweet` class by writing functions,
there are downsides of doing so:
these functions are separate entities from the class itself,
and must be imported by any program that wants to make use of them.


### Defining methods instead

Think back to how you used Python strings before you knew anything
about writing your own classes.
You were used to doing things like this:

```python
>>> word = 'supercalifragilisticexpealidocious'
>>> word.count('i')
6
```

It would be nice to be able to use a Tweet in this way, but we can't;
our current class provides no services other than storage of instance attributes.
We can change that by moving the functions inside the class,
to make them **methods**, which is simply the term for functions that are defined within a class.

We have seen one example of a method already:
the initializer, `__init__`, is a special method that performs the crucial operation of initializing the instance attributes of a newly-created instance of a class.
But any function that operates on an instance of a class can be converted into a method by doing the following:

-   Indent the function so that it is part of the class body
    (i.e., underneath `class Tweet:`).
-   Ensure that the first parameter of the function is an instance of the class, and name this parameter `self`.

For example, we could make `like` a method of `Tweet` with the following code:

```python
class Tweet:
    ...

    def like(self, n: int) -> None:
        """Record the fact that <self> received <n> likes.

        Precondition: n >= 0
        """
        self.likes += n
```

Notice that we now use parameter `self` to access instance attributes,
just as we did in the initializer.


### Calling methods

Now that `like` is a method of the `Tweet` class, we do not need to import it separately; importing just the class `Tweet` is enough.
We call it using the same *dot notation* that we use to access an object's attributes:

```python
>>> from datetime import date
>>> tweet = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
>>> tweet.like(10)  # dot notation!
>>> tweet.likes
10
```

Notice that when we call `tweet.like(10)` we pass one argument,
yet the method has two parameters, `self` and `n`.
What dot notation does for a method call is
*automatically* pass the value to the left of the dot (in this case, `tweet`)
as the method's first parameter `self`.

Again, think back to how you used Python strings before you knew anything about writing your own classes.
When you wrote code like `word.count('i')`,
you passed only the string to be searched for, in this case `'i'`.
How does Python know in what string to search for it?
To the left of the dot we said `word`, so that is the string to search in.
If we had written `name.count('i')` then `name` would be
the string to search in.
The string method `count` is just like the methods that we write:
it has a first parameter called `self` that refers to the object to operate on.


### Referring to methods by their class

A method really is just a function associated with a class, and can be referred to from the class directly, without using an instance.
For example, the method `count` is part of the `str` class, and its full name is `str.count`.
Using this, we can call it directly, just as we would any other function.
The following calls are equivalent:

```python
# Use dot notation to send word to self.
>>> word.count('i')
6

# Send word as an argument.
>>> str.count(word, 'i')
6
```

Similarly, now that `like` is a method of the `Tweet` class, these are equivalent:

```python
>>> intro = Tweet('Diane', date(2018, 9, 11), 'Welcome to CSC148!')
>>> intro.like(10)
>>> Tweet.like(intro, 10)
```

Though we have these two alternatives, we almost always call methods on an instance directly, without referring to the class.
This is because in object-oriented programming, we elevate the object as the entity of central importance.
Every time we use dot notation, we are reminded that it is an object we are working with,
whether we are accessing a piece of data bundled with that object or performing an operation on that object.

There is another important technical reason we use dot notation with the object,
but we'll defer that discussion until we discuss inheritance.


### Methods vs. functions

We just saw that methods in Python are just a special kind of function (ones that are defined within a class).
Everything you already know about designing and writing functions applies equally to all methods you'll write.

But how do we decide when to make something a function and when to make it a method?
Here is the main design difference between functions and methods.
Methods are part of the very definition of the class,
and form the basis of how others can use the class.
They are bundled together with the class,
and are automatically available to every instance of the class.
In contrast, functions that operate on a class instance must be imported separately before they are used.
So it sounds like functions are "less useful" than methods
because you need to do a bit of extra work to use them.
Why not make everything a method?

When we design a class, we aren't just designing it for ourselves,
but for anyone else who might want to use that class in the future.
It is impossible to predict every single thing a person will want to use a class for,
and so it is impossible to write every method that could possibly ever be useful.
And even if we spent a whole lot of time and energy
trying to be comprehensive in defining many methods,
this creates the additional problem that
anyone who wants to use the class must weed through pages and pages of documentation
to find the methods that are actually useful for their purpose.

Here is the rule of thumb we will use.
When we write a class, we write methods for behaviours that we think will be useful for "most" users of the class, and functions for the operations that users of the class must implement themselves for their specific needs.
This is a *design* choice, and it is not a black and white choice; judgment is required!


### Special methods

We said that the initializer was a **special method**.
This is actually a technical term in Python,
and is used to describe a method that we don't have to call using the regular method call syntax.
For example, we do not explicitly call `__init__`; it happens automatically as part of the
three steps for creating a new instance of a class.

Double underscores are used around a method name to indicate that it is a special method.

As we'll soon learn, there are other special methods.
For instance, if we define a method called `__str__`,
it will be called automatically any time we print an instance of a class,
allowing us to specify how the tweet is reported.
For example, this would allow us to write:

```python
>>> print(t1)
Giovanna said "Hello" on 2017-09-18 (0 likes)
```

[^1]: In this course we'll often shorten "instance attribute" to just "attribute", but in future study you'll encounter other kinds of attributes as well.
[^2]: As we'll discuss later, we use the term "method" for any function that is defined inside a class.
[^3]: This is known as *dot notation*, and is common to many programming languages.
[^4]: Of course, this is true not just for our `Tweet` class, but in fact *every* class in Python.# 3.2 Representation Invariants

We now know how to define a class that
bundles together related pieces of data
and includes methods that operate on that data.
These methods provide services to client code, and if we write them sensibly,
the client code can be sure that any instances they create
will always be in a sensible state.
For instance, we can make sure that no data is missing
by writing an initializer that creates and initializes every instance attribute.
And if, say, one instance attribute must always be greater than another
(because that is a rule in the domain of our program),
we can ensure that the initializer and all of the methods will never violate that rule.

Let's return to our Twitter example to consider what
writing the methods "sensibly" entails.

## Documenting rules with representation invariants

Twitter imposes a [280-character limit on tweets][1].
If we want our code to be consistent with this rule,
we must both document it and make sure that every method of the class enforces the rule.
First, let's formalize the notion of "rule".
A **representation invariant** is a property of the instance attributes that every instance of a class must satisfy.
For example, we can say that a representation invariant for our `Tweet` class is that
the `content` attribute is always at most 280 characters long.

We document representation invariants in the docstring of a class, underneath its attributes.
While we could write these representation invariants in English,
we often prefer concrete Python code expressions that evaluate to `True` or `False`,
as such expressions are unambiguous and can be checked directly in our program.

```python
class Tweet:
    """A tweet, like in Twitter.

    Attributes:
        userid: the id of the user who wrote the tweet.
        created_at: the date the tweet was written.
        content: the contents of the tweet.
        likes: the number of likes this tweet has received.

    Representation Invariants:
        - len(self.content) <= 280
    """
    # Attribute types
    userid: str
    created_at: date
    content: str
    likes: int
```

Even though this is a new definition, we have seen representation invariants already:
every instance attribute type annotation is a representation invariant!
For example, the annotation `content: str` means that the content of a tweet must always be a string.


## Enforcing representation invariants

Even though documenting representation invariants is essential,
documentation alone is not enough.
As the author of a class, you have the responsibility of ensuring that
each method is consistent with the representation invariants,
in the following two ways:

1.  At the beginning of the method body (i.e., right when the method is called),
    you can always *assume* that all of the representation invariants are satisfied.
2.  At the end of the method (i.e., right before the method returns),
    it is your responsibility to ensure that all of the representation invariants are satisfied.

That is, each representation invariant is both a *precondition* and *postcondition*
of every method in a class.
You are free to temporarily violate the representation invariants
during the body of the method (and will often do so while mutating the object),
as long as by the end of the method, all of the invariants are restored.

The initializer method is an exception:
it does not have any preconditions on the attributes (since they haven't even been created yet),
but it must initialize the attributes so that they satisfy every representation invariant.

In our Twitter code, what method(s) may require modification in order to ensure that our representation invariant (`len(self.content) <= 280`) is enforced?
Currently, the initializer allows the user to create a `Tweet` object with any message they want, including one that exceeds the limit.
There are a variety of strategies that we can take for enforcing our representation invariant.

One approach is to *process the initializer arguments* so that the instance attributes are initialized to allowed values.
For example, we might truncate a tweet message that's too long:

```python
class Tweet:
    def __init__(self, who: str, when: date, what: str) -> None:
        """Initialize a new Tweet.

        If <what> is longer than 280 chars, only first 280 chars are stored.

        >>> t = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
        >>> t.userid
        'Rukhsana'
        >>> t.created_at
        datetime.date(2017, 9, 16)
        >>> t.content
        'Hey!'
        >>> t.likes
        0
        """
        self.userid = who
        self.created_at = when
        self.content = what[:280]
        self.likes = 0
```


Another approach is to not change the code at all, but instead specify a *precondition* on the initializer:

```python
class Tweet:
    def __init__(self, who: str, when: date, what: str) -> None:
        """Initialize a new Tweet.

        Preconditions:
        - len(what) <= 280

        >>> t = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
        >>> t.userid
        'Rukhsana'
        >>> t.created_at
        datetime.date(2017, 9, 16)
        >>> t.content
        'Hey!'
        >>> t.likes
        0
        """
        self.userid = who
        self.created_at = when
        self.content = what
        self.likes = 0
```

As we discussed in [1.3 The Function Design Recipe](../python-recap/design_recipe.md),
a precondition is something that we *assume* to be true about the function's input.
In the context of this section, we're saying, "The representation invariant will be enforced by our initializer assuming that the client code satisfies our preconditions."
On the other hand, if this precondition is not satisfied, we aren't making any promise about what the method will do (and in particular, whether it will enforce the representation invariants).

### Checking representation invariants automatically with `python_ta`

PythonTA supports checking all representation invariants, just like it does with preconditions!
Let's add a `check_contracts` decorator to our `Tweet` example, but use our original initializer that doesn't check the length of the content.

```python
from python_ta.contracts import check_contracts


@check_contracts
class Tweet:
    """A tweet, like in Twitter.

    Attributes:
        userid: the id of the user who wrote the tweet.
        created_at: the date the tweet was written.
        content: the contents of the tweet.
        likes: the number of likes this tweet has received.

    Representation Invariants:
        - len(self.content) <= 280
    """
    # Attribute types
    userid: str
    created_at: date
    content: str
    likes: int

    def __init__(self, who: str, when: date, what: str) -> None:
        """Initialize a new Tweet."""
        self.userid = who
        self.created_at = when
        self.content = what
        self.likes = 0
```

Now, we'll obtain an error whenever we attempt to create a `Tweet` value with invalid attributes.

```python
>>> Tweet('David', date(2023, 5, 10), 'David' * 100)
Traceback (most recent call last):
  File "<input>", line 1, in <module>
  ...
AssertionError: "Tweet" representation invariant "len(self.content) <= 280" was violated for instance attributes {userid: 'David', created_at: datetime.date(2023, 5, 10), content: 'DavidDavidDa...idDavidDavid', likes: 0}
```

**Notes** about using `check_contracts` with classes:

- `python_ta` is strict with the header `Representation Invariants:`.
  In particular, both the "`Representation`" and "`Invariants`" must be capitalized (and spelled correctly),
  and must be followed by a colon.
  Please watch out for this, as otherwise any representation invariants you add will *not be checked*!


## Another example: non-negativity constraints

Look again at the attributes of `Tweet`.
Another obvious representation invariant is that `likes` must be at least 0;
our type annotation `likes: int` allows for negative integers, after all.
Do any methods need to change so that we can ensure this is always true?
We need to check the initializer and any other method that mutates `self.likes`.

First, the initializer sets `likes` to 0, which satisfies this invariant.
The method `Tweet.like` adds to the `likes` attribute, which would seem safe,
but what if the client code passes a negative number?

Again, we are faced with a choice on how to handle this.
We could impose a precondition that `Tweet.like` be called with `n >= 0`.
Or, we could allow negative numbers as input, but simply set `self.likes = 0` if its value falls below 0.
Or, we could simply refuse to add a negative number, and simply `return` (i.e., do nothing) in this case.

All of these options change the method's behaviour, and so whatever we choose, we would need to update the method's documentation!


## Client code can violate representation invariants also

We've now learned how to write a class that declares and enforces appropriate representation invariants.
We guarantee that whenever client code creates new instances of our class,
and calls methods on them (obeying any preconditions we specify),
our representation invariants will always be satisfied.

Sadly, even being vigilant in implementing our methods
doesn't fully prevent client code from violating representation
invariants---we'll see why in the next section.


[1]: https://developer.twitter.com/en/docs/counting-characters# 3.3 The Class Design Recipe

We have now introduced three elements of a class:

- instance attributes (data)
- methods (operations)
- representation invariants (properties)

Now that we understand the basic mechanics of classes,
it's time to think about the *design* of classes.
In fact, there are a whole host of design questions
that you'll face when designing object-oriented programs.
To help guide you in this process,
we have prepared a **Class Design Recipe**,
which serves an analogous role to the [Function Design Recipe](../python-recap/design_recipe.md).
This is a reference document that you aren't required to follow explicitly,
but will be a helpful way to guide your thinking
when designing your own classes.

You can download the example code used in this section {download}`here<code/course.py>`.

## Part 1: Define the API for the class

1. **Class name and description.**
    Pick a noun to be the name of the class,
    write a one-line summary of what that class represents, and (optionally)
    write a longer, more detailed description. These should help others quickly
    figure out what your class represents.

    ```python
    class Course:
        """A university course.
        """
    ```

    In this case, there isn't much to say, since most everyone knows what a university course is.
    You may wonder why we don't explain what aspects of a course the class is going to model,
    but that will come at a later step.

2. **Example**.
    Write some simple examples of client code that uses your class.
    This will help you figure out what the API should be.
    By taking the point of view of the client, your design is likely to make the class convenient to use.
    Focus for now on *standard* cases (as opposed to a tricky or corner case).
    Write your code as doctest examples and add it to the class docstring.
    Example:

    ```pycon
    >>> his250 = Course('his250', 3, {'a1': 10, 'a2': 10, 'midterm': 30, 'final': 50))
    >>> his250.enrol('123456789')
    True
    >>> his250.enrol('111111111')
    True
    >>> his250.enrol('888888888')
    True
    >>> his250.enrol('222222222')
    False
    >>> his250.record_grade('123456789', 'a1', 80)
    True
    >>> his250.record_grade('123456789', 'a2', 90)
    True
    >>> his250.record_grade('123456789', 'midterm', 70)
    True
    >>> his250.record_grade('123456789', 'final', 80)
    True
    >>> his250.record_grade('888888888', 'a1', 76)
    True
    >>> his250.grade('888888888', 'a1')
    76
    >>> his250.course_grade('123456789')
    78.0
    >>> # Low because student 222222222 did not get a grade for a1:
    >>> his250.class_average('a1')
    52.0
    ```

    In order to come up with this code, many decisions had to be made.
    For example, we chose to specify an enrolment cap
    (in this example, it is 3 so that we can demonstrate attempted enrolment into a full class)
    and had to come up with a way to specify the course marking scheme
    (we chose to use a dictionary).
    We also chose to have some of the methods return a boolean to indicate success or failure.
    As we progress through the recipe, we may realize some decisions weren't great.
    That's fine; we can come back and revise.

3. **Public methods.**
    Using your example as a starting point,
    decide what services your class should provide for
    client code, i.e., what actions could be performed on
    instances of this class.
    For each of these actions, use the first four steps of the [Function Design Recipe](../python-recap/design_recipe.md)
    to define the interface for a method that will provide the action:

    1. Example
    2. Type Contract
    3. Header
    4. Description

    Since you are writing methods, not functions, don't forget to include
    `self` as the first parameter.

    You *must* define an initializer, `__init__`, and often will want to define `__str__` to generate a string representation of instances of the class,
    and `__eq__` to check whether two instances are equal.

    For brevity, only the initializer and one other method is shown below. You can see the rest in the full example code.

    ```python
    class Course:

        def __init__(self, name: str, cap: int, scheme: dict[str, int]) -> None:
            """Initialize this course.

            Precondition: The sum of all values of <scheme> must equal 100.

            >>> c = Course('cscFun', 50, {'exam': 100})
            >>> c.name
            'cscFun'
            >>> c.cap
            50
            """

        def enrol(self, student_id: str) -> bool:
            """Enrol a student in this course.

            Enrol the student with id <student_id> in this course, if there is
            room.

            Return whether enrolment was successful, i.e., this student was not
            already enrolled, and there was room for to enrol them.

            >>> c = Course('cscFun', 50, {'exam': 100})
            >>> c.enrol('12345')
            True
            >>> c.grade('12345', 'exam') is None
            True
            """
    ```

4. **Public attributes.**
    Decide what data you would like client code to be
    able to access without calling a method.
    This is not a clear-cut decision, since one could require *all* data to be accessed by calling a method (and in some languages, that is the convention).
    Python takes the opposite point of view: treat attributes as public unless you have a good reason not to.

    Here are two situations when it makes sense to treat the attribute as private.
    In these cases, we expect the user to access the data by calling methods.

    - An attribute with complex restrictions on its value.
        If client code were to assign a value to the attribute directly,
        it might inadvertently violate the restriction.
        If instead it is required to call a method to change the value, the method implementation can enforce any restriction.
    - An attribute that represents data from the domain in a complex way.
        (We'll learn some fairly complex data structures this term.)
        By expecting client code to access the information through a method call,
        we spare the client code from having to be aware of the complex details,
        and we also avoid the problem of client code accidentally messing up important
        properties of the data structure.

    Once you have chosen the public attributes,
    add a section to your class docstring after the description,
    specifying the **name** and **description** of each of these
    attributes.
    Then below the docstring, specify the **type** of each variable as well.
    Use the format below.

    ```python
    class Course:
        """A university course.

        Attributes:
            name: the name of this course.
            cap: The enrolment cap for this course, i.e., the maximum number of
                students who may enrol.
        """
        name: str
        cap: int
    ```

At this point you have defined everything that client code needs in order
to use the class successfully.

## Part 2: Implement the class

Now turn your attention to implementing the class.
Any comments you write at this point concern implementation details, and are for the developers of the class itself.
As a result, they will not go in the class docstring or in method docstrings; these are for developers of client code.

1. **Internal (private) attributes.**
    In order to write the bodies of the
    public methods, you will likely need additional attributes, but ones
    that the client code (a) need not know about and (b) should not access
    directly.
    For example, we need a way to record all the grades in the course.
    We chose a dictionary of dictionaries (organized first by student, then by course element),
    but client code shouldn't have to traverse this structure -- that's the job of your class.
    A programmer who writes client code shouldn't even have to know which structure you chose.
    In fact, if client code always accesses data through your public methods,
    you have the freedom to change internal details without breaking any client code.

    An internal attribute is not part of the public interface of the class,
    and its name should begin with an underscore to indicate this.

    Add a separate section to the class docstring for private attributes.
    For each internal attribute, use the same format as above to define the
    **type**, **name**, and **description** of each of the internal attributes.

    ```python
    """
    ...

    Private Attributes:
        _scheme:
            The marking scheme for this course.  Each key is an element of the
            course, and its value is the weight of that element towards the
            course grade.
        _grades:
            The grades earned so far in this course.  Each key is a student
            ID and its value is a dict mapping a course element to the student's
            mark on that element.  If a student did not submit that element,
            it does not appear as a key in the student's dict.  If, however,
            they earned a grade of zero, this is recorded as any other grade
            would be.
    """
    name: str
    cap: int
    _scheme: dict[str, int]
    _grades: dict[str, dict[str, int]]
    ```

2. **Representation invariants.**
    Add a section to your class docstring containing invariants that involve your attributes: properties that must always be true (one could say they must never "vary" from truth, hence the name "invariant").
    These may be restrictions that cannot be captured by types alone in Python.
    For example, a student's 'age' must be greater than 0, or every course code must consist of 3 letters and then 3 numbers.
    They may also express important relationships between the attributes.

    ```python
        """
        ...

        Representation Invariants:
            - The sum of all weights in _scheme must be 100.
            - Each key in every student's dict of grades must be an element of the
            course grading scheme, i.e., must occur as a key in _scheme.
        """
    ```

3. **Implement Public Methods.**
    Use the last two steps of the Function Design Recipe to
    implement the public methods in your class.

    5. Implement the method body
    6. Test your method implementation

    Use helper methods to simplify your code. A helper method is not part of
    the public interface of the class, and its name should begin with an
    *underscore* to indicate this.

    For each method, you should assume that the representation invariants are
    all satisfied when the method is called, but **you must ensure that
    the invariants are satisfied when the method exits**.

    Note that your initializer should initialize *all* of the attributes of the instance;
    it should not do anything else. You can find the complete implementation in the full code example.

    ```python
    class Course:
        def __init__(self, name: str, cap: int, scheme: dict[str, int]) -> None:
            """Initialize this course.

            Precondition: The sum of all values of <scheme> must equal 100.

            >>> c = Course('cscFun', 50, {'exam': 100})
            >>> c.name
            'cscFun'
            >>> c.cap
            50
            """
            self.name = name
            self.cap = cap
            self._scheme = scheme
            self._grades = {}

        def enrol(self, student_id: str) -> bool:
            """Enrol a student in this course.

            Enrol the student with id <student_id> in this course, if there is
            room.

            Return whether enrolment was successful, i.e., this student was not
            already enrolled, and there was room for to enrol them.

            >>> c = Course('cscFun', 50, {'exam': 100})
            >>> c.enrol('12345')
            True
            >>> c.grade('12345', 'exam') is None
            True
            """
            if len(self._grades) < self.cap:
                if student_id in self._grades:
                    return False
                else:
                    self._grades[student_id] = {}
                    return True
            else:
                return False
    ```

Notice that method `__init__` does not confirm that its precondition for parameter `scheme` is met.
The same is true of other methods with preconditions.
A method simply assumes that its preconditions are true,
and makes no promises about what will happen if they are not.# 3.4 More on Designing Classes

In the previous section, we introduced the *Class Design Recipe*, which is a formal process for designing and implementing classes.
In this section, we'll cover some important principles and subtle points when it comes to class design that will inform how we use classes throughout the rest of this course.

## Information hiding

The fundamental themes of the Class Design Recipe are
*design before coding* and *information hiding*.
Just as a great deal of thought goes into precisely specifying
the purpose and expected behaviour of a function before you implement it,
so too do you have to think about the *design* of a class
before implementing even a single method.

The relationship between the author and client of a class
plays a powerful and subtle role in class design.
When we design a class,
we must think about *how another person would use this class*.
In other words, we design a class to be used by others,
whether it's other team members, colleagues on a different project,
or even ourselves when we are writing new code
months or years into the future
(and only vaguely recall writing the class in the first place).
And one of the biggest desires of "other users" is
to be able to use our class without having to know at all how it works.

Designing classes by separating
the public interface of the class from
the private implementation details
is known as **information hiding**,
and is one of the fundamental elements of object-oriented programming.
One of the biggest advantages of designing our programs in this way is that
after our initial implementation, we can feel free to modify it
(e.g., add new features or make it more efficient)
without disturbing the public interface,
and rest assured that this doesn't affect
other code that might be using this class.

Unfortunately, this course is too small in scope
to give you the opportunity to write code for other people,
although do keep in mind that you're always writing your code
for your future self.
We'll encourage you to follow the Class Design Recipe and
think carefully about a clear separation between
what one needs to know to *implement* a class and
what information one needs to know to *use* that class.

## Private-ness in Python

As we have already discussed,
the Class Design Recipe places a great emphasis on the distinction between
the public interface of a class and its private implementation.
So far, the focus has been on using *documentation* to define a clear interface:
explicitly writing a good class docstring with all public attributes of the class clearly documented,
and method docstrings that describe the operations the class supports.
In this section, we'll discuss another important way to document
the attributes and methods that we want to keep private,
and then go over pitfalls concerning the very concept of "private-ness" in Python.

### Leading underscores

An extremely common Python naming convention is to
name anything that is considered private with a **leading underscore**.
An underscore on an instance attribute indicates to a programmer writing client code that
they should not access the instance variable:
They should not use its value, and they certainly shouldn't change it.

We can not not only mark attributes as private, but methods as well.
What would be the point of a method that client code shouldn't call?
It could be a private helper for one of the methods that client code *is* welcome to call.

### Python's "we're all adults" philosophy

In other programming languages,
when we declare restrictions on which attributes can be accessed outside the class and which cannot,
they are enforced as part of the language itself.
In Java, for example,
attempting to access or modify an attribute that has been marked as private
leads to an error that prevents the program from running at all.

The Python language takes a different approach to private attributes and methods,
which is informed by one of its core philosophies: "We're all adults here."
The idea is that the language gives its programmers a great deal of
freedom when writing code---including allowing programmers to access private attributes
and methods of classes from outside the class.
While there are some Python language mechanisms
for performing further restriction on access,
they are beyond the scope of the course,
and they are weak mechanisms that can be circumvented.

As a result of the Python philosophy,
if someone else wants to use your class,
they are ultimately responsible for using it "properly."
And if they do not, well, they're an adult;
if they access a private attribute or method,
they should be aware that this might lead to unexpected or disappointing results.

This permissiveness doesn't mean that we give up on private attributes or methods altogether.
Our previous discussion about the philosophy of public vs. private is still valid,
and indeed respected by Python programmers.
It just means that it is absolutely vital in Python
to write good documentation and follow coding conventions.
In particular, this is why it is not enough to implement methods so that they enforce our desired representation invariants.
Because a programmer may wish to access and mutate instance attributes directly,
our representation invariants must be carefully documented so that the programmer knows (and is responsible for maintaining) these invariants.

This way, we give the users of our class enough information to use it the way we intended,
and alert them to the things they should *not* do.
And if the user ignores our documentation?
That's up to them, risks and all.


## Combining classes: composition

A class is almost never defined and used in isolation.
It is much more often the case that it belongs to a large collection of classes,
which are all related to each other in various ways.
One fundamental type of relationship between two classes occurs when
the instances of one class have an attribute which refers to one or more instances of the other class.

A `User` object might have a list of `Tweet`s as an attribute.
Colloquially, we say that a User "has some" Tweets.

```python
class User:
    """A Twitter user.

    Attributes:
        userid: the userid of this Twitter user.
        bio: the bio of this Twitter user.
        tweets: the tweets that this user has made.
    """
    # Attribute types
    userid: str
    bio: str
    tweets: list[Tweet]
```

This type of relationship between classes is called **composition**, and appears all the time in object-oriented programming, because it arises so naturally.
Whenever we have two classes, and one refers to instances of the other, that's composition!

It is also the case that two classes might be related by composition in more than one way.
For example, we might change `Tweet` so that it has an instance attribute `user` of type `User`,
rather than just a string for the user's id.
We could even add an extra attribute `original_creator` of type `User` as well,
representing the distinction between the user who originally wrote the tweet,
and another user who retweets it.


## Exercises: modelling with classes

A common programming task is to take an English description of a problem
and design classes that model the problem.
The main idea is that the class(es) should correspond to the most important noun(s) in the problem,
the attributes should be the information (other nouns or adjectives) associated with these noun(s),
and the methods correspond to the verbs.

Here are a few examples for you to try out.

### People
We'd like to create a simple model of a person. A person normally can be identified by their name, but might commonly be asked about her age (in years). We want to be able to keep track of a person's mood throughout the day: happy, sad, tired, etc. Every person also has a favourite food: when she eats that food, her mood becomes `'ecstatic'`. And though people are capable of almost anything, we'll only model a few other actions that people can take: changing their name, and greeting another person with the phrase `'Hi ____, it's nice to meet you! I'm ____.'`


### Rational numbers
It's slightly annoying for math people to use Python, because fractions are always converted to decimals and rounded, rather than kept in exact form. Let's fix that! A rational number consists of a numerator and denominator; the denominator cannot be 0. Rational numbers are written like
7/8. Typical operations include determining whether the rational is
positive, adding two rationals, multiplying two rationals, comparing
two rationals, and converting a rational to a string.

### Restaurant recommendation

We want to build an app which makes restaurant recommendations for a group of friends going out for a meal. Each person has a name, current location, dietary restrictions, and some ratings and comments for existing restaurants. Each restaurant has a name, a menu from which one can determine what dishes accommodate what dietary restrictions, and a location. The recommendation system, in addition to actually making recommendations, should be able to report statistics like the number of times a certain person has used the system, the number of times it has recommended each restaurant, and the last recommendation made for a given group of people.