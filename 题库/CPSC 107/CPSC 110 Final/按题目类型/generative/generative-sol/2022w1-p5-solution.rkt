;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
;; YOUR CWLs WILL BE SUFFICIENT TO IDENTIFY YOU AND, IF YOU HAVE ONE, YOUR
;; PARTNER
;;

(require spd/tags)

(@assignment exams/2022w1-f/f-p5)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line


(@htdf bizz-buzz)
(@signature Natural -> (listof String))
(check-expect (bizz-buzz 1) (list "1"))
(check-expect (bizz-buzz 23)
              (list "1" "2" "bizz"
                    "4" "5" "bizz"
                    "buzz"
                    "8" "bizz"
                    "10" "11" "bizz"
                    "13" "buzz"
                    "bizz"
                    "16" "17" "bizz"
                    "19" "20" "bizz-buzz"
                    "22" "23"))
(check-expect (bizz-buzz 42)
              (list "1" "2" "bizz"
                    "4" "5" "bizz"
                    "buzz"
                    "8" "bizz"
                    "10" "11" "bizz"
                    "13" "buzz"
                    "bizz"
                    "16" "17" "bizz"
                    "19" "20" "bizz-buzz"
                    "22" "23" "bizz"
                    "25" "26" "bizz"
                    "buzz" "29" "bizz"
                    "31" "32" "bizz"
                    "34" "buzz" "bizz"
                    "37" "38" "bizz"
                    "40" "41" "bizz-buzz"))

(@template-origin genrec accumulator encapsulated)

(define (bizz-buzz stop)
  ;; 3c, 7c are Natural
  ;; each counter means n is the nth number since last multiple of 3/7
  ;; so  when 3c is 3 n is a multiple of 3,
  ;; and when 7c is 7 n is a multiple of 7,
  (local [(define (fn-for-n n 3c 7c)
            ;; trivial: > n stop
            ;; reduction: add 1 to n
            ;; argument: adding 1 to n will eventually exceed any Natural
            (cond [(> n stop) empty]
                  [(and (= 3c 3) (= 7c 7))
                   (cons "bizz-buzz" (fn-for-n (add1 n) 1 1))]
                  [(= 3c 3) (cons "bizz"      (fn-for-n (add1 n) 1 (add1 7c)))]
                  [(= 7c 7) (cons "buzz"      (fn-for-n (add1 n) (add1 3c) 1))]
                  [else
                   (cons (number->string n)
                         (fn-for-n (add1 n) (add1 3c) (add1 7c)))]))]

    (fn-for-n 1 1 1)))

#;#;
(@template fn-composition use-abstract-fn)

(define (bizz-buzz stop)
  (map (lambda (n)
         (cond [(and (zero? (remainder n 3))
                     (zero? (remainder n 7)))
                "bizz-buzz"]
               [(zero? (remainder n 3)) "bizz"]
               [(zero? (remainder n 7)) "buzz"]
               [else (number->string n)]))
       (build-list stop add1)))
