;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)


(@assignment exams/2023w2-f/f-p4) ;Do not edit or remove this tag

(@cwl ???)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(@htdd RunLengthEncoding)

(define-struct rle (num str next))
;; RunLengthEncoding is one of:
;;  - false
;;  - (make-rle Natural 1String RunLengthEncoding)
;;
;; interp.
;;  A run length encoding (RLE) of a string.
;;    - false represents the end of the string ("").
;;    - (make-rle num str next) represents a string of num occurrences
;;      of str, followed by whatever string next represents
;;
(define RLE-MTS false)
(define RLE-AAA    (make-rle 3 "A" false))
(define RLE-AAATT  (make-rle 3 "A" (make-rle 2 "T" false)))
(define RLE-CAAATT (make-rle 1 "C" (make-rle 3 "A" (make-rle 2 "B" false))))

(define (fn-for-rle rle)
  (cond [(false? rle) (...)]
        [else
         (... (rle-num rle)
              (rle-str rle)
              (fn-for-rle (rle-next rle)))]))


(@htdf encode)
(@signature (listof 1String) -> RunLengthEncoding)
;; Encode a list of 1String into the correct RunLengthEncoding
(check-expect (encode (list "C" "A" "A" "A" "B" "B"))   ;provided test
              (make-rle 1 "C"
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))

(check-expect (encode empty) false)

(check-expect (encode (explode "A"))
              (make-rle 1 "A" false))

(check-expect (encode (explode "AB"))
              (make-rle 1 "A" (make-rle 1 "B" false)))

(check-expect (encode (explode "AAB"))
              (make-rle 2 "A" (make-rle 1 "B" false)))

(check-expect (encode (explode "CAAABB"))
              (make-rle 1 "C"
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))

(@template-origin accumulator (listof 1String))

;turn this on to force grader to produce score for decode
;(define (encode los0) 1)

(define (encode los0)
  ;; prev is 1String; 1String immediately before los in los0
  ;; rl is Natural;   number of sequential occurrences of prev before los
  (local [(define (fn-for-los los prev rl)
            (cond [(empty? los) (make-rle rl prev false)]
                  [else
                   (if (string=? (first los) prev)
                       (fn-for-los (rest los) prev (add1 rl))
                       (make-rle rl prev
                                 (fn-for-los (rest los) (first los) 1)))]))]
    (if (empty? los0)
        false
        (fn-for-los (rest los0) (first los0) 1))))



(@htdf decode)
(@signature RunLengthEncoding -> (listof 1String))
;; Decode a RunLengthEncoding into the list of 1String that it represents

(check-expect (decode (make-rle 1 "C"                   ;provided test
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))
               (list "C" "A" "A" "A" "B" "B"))

(check-expect (decode (make-rle 1 "A" false)) (explode "A"))
(check-expect (decode (make-rle 2 "A" false)) (explode "AA"))
(check-expect (decode (make-rle 1 "C"
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))
              (explode "CAAABB"))


(@template-origin RunLengthEncoding)

(define (decode rle)
  (cond [(false? rle) empty]
        [else
         (append (make-list (rle-num rle) (rle-str rle))
                 (decode (rle-next rle)))]))

