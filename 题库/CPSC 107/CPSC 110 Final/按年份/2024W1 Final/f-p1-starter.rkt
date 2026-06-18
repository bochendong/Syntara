;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p1) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line

;;
;; Given the following definition:
;;


(define A (+ 1 2))
(define B (+ A 3))

(define (foo a b)
  (local [(define (bar x a)
            (list (+ a x)
                  (+ B b)
                  C))
          (define C (+ a b))]
    (bar 4 5)))

#|

 YOU ARE NOT PERMITTED TO USE THE STEPPER AT ANY POINT IN THIS EXAM.

 Now consider the evaluation of the following expression.  During this 
 evaluation, two definitions will be lifted.  We want you to write the two
 lifted definitions - but you MUST FOLLOW THESE INSTRUCTIONS VERY CAREFULLY:

   - In the marked space below write ONLY THE TWO LIFTED DEFINITIONS.

   - You must write them IN THE SAME ORDER THEY APPEAR IN THE ORIGINAL
     PROGRAM, with the first lifted definition first and the second second.

   - If you want to do scratch work to figure out the lifted definitions 
     then do that ONLY IN THE SCRATCH SPACE PROVIDED.

   - The lifted definitions must use the same naming convention as the
     stepper. (Reminder: YOU MAY NOT USE THE STEPPER.)

None of the lifted definitions should be commented out. Anything that is
commented out will not be graded.

NOTE: This question will be entirely autograded, your file must run without
errors. Submitting a file that has errors when it runs will result in a
score of 0.

|#


(foo 1 B)
  
;; write JUST THE LIFTED DEFINITIONS BELOW HERE


;; write JUST THE LIFTED DEFINITIONS ABOVE HERE



#| ;DO ANY SCRATCH WORK BELOW THIS LINE


|# ;DO ANY SCRATCH WORK ABOVE THIS LINE
