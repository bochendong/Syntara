;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname mt2-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment 107/exams/2025w2-mt2/mt2-p3) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
;;
;; Consider the following definition:
;;

(define (biz a b c)
  (local [(define (foo d)
            (+ b c d))

          (define (bar a x)
            (local [(define (foo d)
                      (list d b a))]
              (* 2 a b)))
              
          (define (bux z y)
            (biz y z))]
    (bar b (foo a))))

#|

 YOU ARE NOT PERMITTED TO USE THE STEPPER AT ANY POINT IN THIS EXAM.

 Now consider the evaluation of the following expression.  During this
 evaluation, some number of definitions will be lifted.  We want you to
 write all the lifted definitions - but you MUST FOLLOW THESE INSTRUCTIONS
 VERY CAREFULLY:

   - In the marked space below write ONLY THE LIFTED DEFINITIONS.

   - You must write them IN THE ORDER THEY ARE LIFTED, with the first
     lifted definition first and so on.

   - If you want to do scratch work to figure out the lifted
     definitions then do that ONLY IN THE SCRATCH SPACE PROVIDED.

   - The lifted definitions must use the same naming convention as the
     stepper. (Reminder: You may not use the stepper.) Add _0 to the 
     first set of lifted definitions, _1 to the second set, and so-forth.

  
None of the lifted definitions should be commented out. Anything that is
commented out will not be graded.

NOTE: This question will be entirely autograded, your file must run without
errors. Submitting a file that has errors when it runs will result in a
score of 0.

|#


(biz 4 5 6) 

;; write THE LIFTED DEFINITIONS BELOW HERE




;; write the LIFTED DEFINITIONS ABOVE HERE



#| ;DO ANY SCRATCH WORK BELOW THIS LINE


|# ;DO ANY SCRATCH WORK ABOVE THIS LINE
