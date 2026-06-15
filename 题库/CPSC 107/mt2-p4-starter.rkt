;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname mt2-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment 107/exams/2025w2-mt2/mt2-p4) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line

#|

Complete the design of the function below by writing the template origin tag
and the function definition.  

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION. Failure to follow these requirements may result in
      receiving zero marks for this problem. To receive full marks, it does not
      suffice for your function DESIGN to pass all relevant check-expects.    
      A full-marks function design uses built-in abstract functions in a way
      that as concisely and directly as possible reflects the structure of the
      problem being solved.


 - The function you design MUST BE CALLED repeat-odds-n-times.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You MUST NOT EDIT any part of the file above the first line marked with ***.
 - You MUST FOLLOW all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - The function definition MUST call one or more built-in abstract functions.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers, but they must be defined within the the
   top-level function using local.

 - The function definition and any helper functions you design MUST NOT be
   recursive.

 - The result of the function must directly be the result of one of the
   built-in abstract functions. So, for example, the following would not
   be a valid function body:

       (define (foo x)
         (empty? (filter ...)))

   This would be a valid function body:

       (define (foo x)
         (local [(define (helper y) (foldr ... ... ...))]
           (helper ...)))

|#


(@htdf repeat-odds-n-times)
(@signature (listof Natural) -> (listof Natural))
;; produce a list where each odd number n in lon appears n times
(check-expect (repeat-odds-n-times (list 5 4 1)) (list 5 5 5 5 5 1))
(check-expect (repeat-odds-n-times (list 1 2 3)) (list 1 3 3 3))
(check-expect (repeat-odds-n-times (list 0)) empty)
(check-expect (repeat-odds-n-times empty) empty)

;; *** MUST NOT EDIT ANY LINE ABOVE HERE except cwl tag ***

(define (repeat-odds-n-times lon) empty) ;stub