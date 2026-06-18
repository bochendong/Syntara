;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p2)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

#|

[14 points]

Complete the design of the function below.

The function consumes a list and produces the count of repeated items in the
list. By repeated we mean an item that is the same as the item just before
it. Note that the function is abstract - the first argument is an equality 
predicate - this allows it to work with any type of data.

So, for example, (count-repeats = (list 9 5 5 4 5 6 7 7 8 9 9 9 10)) produces 4
because there are 4 elements of the list that are = to the element just before
them.

Your answer must include @template-origin and a correct function definition.

For maximum credit you must treat this as an accumulator problem.  Your template
origin should be (@template-origin (listof X) accumulator).

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED count-repeats.
 - You MUST NOT EDIT the provided @htdf tag, @signature tag, or purpose.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You should add new tests below the line marked with ***, because the
   function does not have sufficient tests.
 - You must follow all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

|#
(@htdf count-repeats)
(@signature (X X -> Boolean) (listof X) -> Natural)
;; produce count of items in list that same? says are the same as previous item
(check-expect (count-repeats = empty) 0)
(check-expect (count-repeats = (list 1)) 0)
(check-expect (count-repeats = (list 9 5 5 4 5 6 7 7 8 9 9 9 10)) 4)
(check-expect (count-repeats string=? (list "a" "b" "b" "c" "d" "d")) 2)

;; *** do not edit above this line ***

(define (count-repeats same? lox) 0)
