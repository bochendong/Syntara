;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)

(@assignment exams/2023w1-f/f-p3) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

;;
;; Given the following definition:
;;

(define (one-fish a b)
  (local [(define (two-fish c)
            (local [(define (red-fish c)
                      (string-append c "!" b))]
              (string-length c)))
          (define (red-fish a)
            (list a "purple" a))
          (define (blue-fish b)
            (+ a b 1))]
    (blue-fish (two-fish b))))

#|

 Now consider the evaluation of the following expression.  During this
 evaluation, some number of definitions will be lifted.  We want you to
 write the lifted definitions - but you MUST FOLLOW THESE INSTRUCTIONS
 VERY CAREFULLY:

   - In the marked space below write ONLY THE LIFTED DEFINITIONS.

   - You must write them IN THE ORDER THEY ARE LIFTED, with the first
     lifted definition first and so on.

   - If you want to do scratch work to figure out the lifted
     definitions then do that ONLY IN THE SCRATCH SPACE PROVIDED.

None of the lifted definitions should be commented out. Anything that is
commented out will not be graded.

NOTE: This question will be entirely autograded, your file must run without
errors. Submitting a file that has errors when it runs will result in a
score of 0.

|#

(one-fish 3 "green")

;; write ALL THE LIFTED DEFINITIONS BELOW HERE

(define (two-fish_0 c)
  (local [(define (red-fish c)
            (string-append c "!" "green"))]
    (string-length c)))

(define (red-fish_0 a)
  (list a "purple" a))

(define (blue-fish_0 b)
  (+ 3 b 1))

(define (red-fish_1 c)
  (string-append c "!" "green"))


;; write ALL THE LIFTED DEFINITIONS ABOVE HERE




#| ;DO ANY SCRATCH WORK BELOW THIS LINE



|# ;DO ANY SCRATCH WORK ABOVE THIS LINE
