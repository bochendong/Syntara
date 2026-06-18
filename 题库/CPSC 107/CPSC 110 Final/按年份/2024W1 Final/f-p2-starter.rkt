;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p2) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line


#|

You already know that factorial of a natural number n is

   n! = n * n-1 * ... 1 

So, for example

   4! = 4 * 3 * 2 * 1

The factorial of 0 is also 1.


The super factorial of a natural number n is similar, except that instead of
being the product of the n natural numbers in [1, n], the super factorial is
the product of the factorials of the n natural numbers in [1, n].

So, for example:

   (superfact 4) = 4! * 3! * 2! * 1!

Or, in more detail:

   (superfact 4) = 4 * 3 * 2 * 1  *  3 * 2 * 1  *  2 * 1  *  1

Design a function that consumes a natural number n and produces the
superfactorial of n.  There's a nice, but a little tricky solution using
built-in functions, or you can just use the ordinary recursive Natural
number template.

Slow down, follow the recipe, and follow the helper rules and you should
find that this problem is not actually that difficult.  At the very least
you should be able to earn partial credit for following the recipe.


Your function design must include an @htdf tag, @signature tag, purpose,
commented out stub, appropriate tests, a @template-origin tag, and a function
definition. You must follow all applicable design rules.

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

 - You must not edit, comment out, or delete the existing @htdf tag.

 - You must define a function with the same name as in the existing @htdf tag.

 - You should not edit the existing stub, but you will need to comment it out
   at some point.

 - Your design must include @signature, purpose, appropriate tests,
   @template-origin, and a working function definition.

 - You must follow all applicable design rules.

 - If you need any helper functions then you may define them using local.
   Or, if you choose to define a helper at top level, then as usual you must
   include all HtDF recipe elements (@htdf tag, @signature, purpose,
   check-expects, @template-origin, and function definition). Except for the
   purpose, do not comment out any of those elements.

 - Files must not have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

(@htdf superfact)
(@signature Natural -> Natural)
;; produce the super factorial of n

(define (superfact n) 0) ;stub

