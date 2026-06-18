;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)


(@assignment exams/2020W2-F/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for problem sets)

(@problem 1) ;DO NOT EDIT OR DELETE THIS LINE!

(@htdf foo)

;; PROBLEM
;;
;; Write the signature for the following abstract function.
;;   Do your SCRATCH WORK SOMEWHERE ELSE, and then 
;;   put your FINAL ANSWER in the @signature ABOVE the function definition.
;;
;; Make sure your file runs properly before submitting it.  Running won't do
;; much, but it will ensure your parentheses are balanced etc.  That will
;; allow it to be autograded.  Submissions that do not run properly may
;; be penalized up to 100%.

;; Uncomment the following line and put your signature in the tag as usual.
;(@signature )

(define (foo a b c d)
  (cond [(a c) d]
        [else
         (cons (b (first c))
               (foo a b (rest c) d))]))



