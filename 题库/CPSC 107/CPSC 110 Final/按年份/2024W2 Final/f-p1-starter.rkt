;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2024w2-f/f-p1) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line


#|

Carefully study the explanation in f-p1-figure.pdf, then complete the design
of the function below by writing appropriate tests, the template origin tag,
and the function definition. You must use one or more built-in abstract
function(s) in your solution. 

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED square-spin.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - You MUST FOLLOW all applicable design rules.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - We are providing one check-expect, which you MUST NOT EDIT OR COMMENT OUT.

 - You must add more tests.

 - The function definition MUST call one or more built-in abstract functions.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers inside the top-level function, either using
   lambda, or as local definitions using local.

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

You may find the primitive function expt useful. Given two numbers,
it produces the power of the first to the second number.

For example,
                             
       (expt 2 3)
 
produces 8 as 2^3 = 8.
                              
|#


(define SCALE-FACTOR 1.414)

(@htdf square-spin)
(@signature Natural Number Color -> Image)
;; produce n overlaid enclosing squares of color c, rotating by 45 each layer
(check-expect (square-spin 5 30 "red")
              (overlay (square  30 "outline" "red")
                       (rotate  45 (square (* 30 SCALE-FACTOR) "outline" "red"))
                       (rotate  90 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR)
                                           "outline" "red"))
                       (rotate 135 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR)
                                           "outline" "red"))
                       (rotate 180 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR)
                                           "outline" "red")))) 

(define (square-spin n side c) empty-image) ;stub
