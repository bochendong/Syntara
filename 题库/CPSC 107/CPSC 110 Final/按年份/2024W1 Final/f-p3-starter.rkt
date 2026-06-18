;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p3) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


#|

Design a function that consumes a (listof X). The function alternates between
picking and skipping elements of the list. Each pick step, only one element of 
the list is picked. Each skip step, one more element is skipped than the last
time.
  
For example:

  (skip-da-dee-do (list 0 1 2 3 4 5 6 7 8 9 10 11))

Produces

  (list 0 1 3 6 10)

Because:

  - pick 1 element  -  0
  - skip 0 elements - 
  - pick 1 element  -  1
  - skip 1 element  - 
  - pick 1 element  -  3
  - skip 2 elements - 
  - pick 1 element  -  6
  - skip 3 elements - 
  - pick 1 element  - 10
  - skip 4 elements -     one is skipped and then list runs out


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

 - If you design any helper functions you must provide a complete HtDF
   design, with @htdf, @signature, purpose, appropriate tests, commented
   out stub, @template-origin, and function definition.
   Except for the purpose and the stub, do not comment out any of those
   elements.   

 - Files must not have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#


(@htdf skip-da-dee-do)
(@signature (listof X) -> (listof X))
;; pick 1, skip 0, pick 1, skip 1, pick 1, skip 2, pick 1, skip 3...
(check-expect (skip-da-dee-do (list)) (list))
(check-expect (skip-da-dee-do (list 0 1 2 3 4 5 6 7 8 9 10 11 12))
              (list 0 1 3 6 10))
(check-expect (skip-da-dee-do (list "a" "b" "c" "d" "e" "f"))
              (list "a" "b" "d"))


(define (skip-da-dee-do lox) empty);stub
